#include <windows.h>
#include <netfw.h>
#include <oleauto.h>
#include <cwchar>
#include <iostream>
#include <string>

#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "oleaut32.lib")
#pragma comment(lib, "advapi32.lib")

namespace {
constexpr wchar_t kNdiRule[] = L"GEC Automatic News - NDI Bridge";
constexpr wchar_t kLanRule[] = L"GEC Automatic News - Output LAN";
constexpr wchar_t kRemoteScope[] = L"LocalSubnet";
constexpr long kProfiles = NET_FW_PROFILE2_DOMAIN | NET_FW_PROFILE2_PRIVATE;

struct ComInit {
  HRESULT hr;
  ComInit() : hr(CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED)) {}
  ~ComInit() { if (SUCCEEDED(hr)) CoUninitialize(); }
};

template <typename T> void releaseCom(T*& p) { if (p) { p->Release(); p = nullptr; } }

bool ieq(const std::wstring& a, const std::wstring& b) {
  return _wcsicmp(a.c_str(), b.c_str()) == 0;
}

std::wstring fromBstr(BSTR value) {
  return value ? std::wstring(value, SysStringLen(value)) : std::wstring();
}

bool isElevated() {
  HANDLE token = nullptr;
  if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) return false;
  TOKEN_ELEVATION elevation{};
  DWORD size = 0;
  const BOOL ok = GetTokenInformation(token, TokenElevation, &elevation, sizeof(elevation), &size);
  CloseHandle(token);
  return ok && elevation.TokenIsElevated != 0;
}

std::wstring argValue(int argc, wchar_t** argv, const wchar_t* key) {
  const std::wstring prefix = std::wstring(key) + L"=";
  for (int i = 1; i < argc; ++i) {
    const std::wstring v = argv[i] ? argv[i] : L"";
    if (v.rfind(prefix, 0) == 0) return v.substr(prefix.size());
    if (v == key && i + 1 < argc) return argv[i + 1] ? argv[i + 1] : L"";
  }
  return L"";
}

bool hasArg(int argc, wchar_t** argv, const wchar_t* key) {
  for (int i = 1; i < argc; ++i) if (argv[i] && _wcsicmp(argv[i], key) == 0) return true;
  return false;
}

bool validBridgePath(const std::wstring& path, bool requireFile) {
  if (path.empty()) return false;
  const size_t slash = path.find_last_of(L"\\/");
  const std::wstring name = slash == std::wstring::npos ? path : path.substr(slash + 1);
  if (!ieq(name, L"gec-ndi-bridge.exe")) return false;
  if (!requireFile) return true;
  const DWORD attr = GetFileAttributesW(path.c_str());
  return attr != INVALID_FILE_ATTRIBUTES && (attr & FILE_ATTRIBUTE_DIRECTORY) == 0;
}

bool parsePort(const std::wstring& text, long& port) {
  if (text.empty()) return false;
  wchar_t* end = nullptr;
  const long value = wcstol(text.c_str(), &end, 10);
  if (!end || *end != L'\0' || value < 1024 || value > 65535) return false;
  port = value;
  return true;
}

HRESULT openPolicy(INetFwPolicy2** policy, INetFwRules** rules) {
  if (!policy || !rules) return E_POINTER;
  *policy = nullptr; *rules = nullptr;
  HRESULT hr = CoCreateInstance(__uuidof(NetFwPolicy2), nullptr, CLSCTX_INPROC_SERVER,
                                __uuidof(INetFwPolicy2), reinterpret_cast<void**>(policy));
  if (FAILED(hr)) return hr;
  hr = (*policy)->get_Rules(rules);
  if (FAILED(hr)) releaseCom(*policy);
  return hr;
}

bool bstrEquals(BSTR value, const std::wstring& expected) {
  return _wcsicmp(fromBstr(value).c_str(), expected.c_str()) == 0;
}

bool readRule(INetFwRules* rules, const wchar_t* name, INetFwRule** out) {
  if (!rules || !out) return false;
  *out = nullptr;
  BSTR bname = SysAllocString(name);
  const HRESULT hr = rules->Item(bname, out);
  SysFreeString(bname);
  return SUCCEEDED(hr) && *out;
}

bool commonRuleMatches(INetFwRule* rule) {
  if (!rule) return false;
  VARIANT_BOOL enabled = VARIANT_FALSE;
  NET_FW_RULE_DIRECTION direction = NET_FW_RULE_DIR_MAX;
  NET_FW_ACTION action = NET_FW_ACTION_BLOCK;
  long profiles = 0;
  BSTR remote = nullptr;
  const bool ok = SUCCEEDED(rule->get_Enabled(&enabled)) && enabled == VARIANT_TRUE &&
                  SUCCEEDED(rule->get_Direction(&direction)) && direction == NET_FW_RULE_DIR_IN &&
                  SUCCEEDED(rule->get_Action(&action)) && action == NET_FW_ACTION_ALLOW &&
                  SUCCEEDED(rule->get_Profiles(&profiles)) && (profiles & kProfiles) == kProfiles &&
                  (profiles & NET_FW_PROFILE2_PUBLIC) == 0 &&
                  SUCCEEDED(rule->get_RemoteAddresses(&remote)) && bstrEquals(remote, kRemoteScope);
  if (remote) SysFreeString(remote);
  return ok;
}

bool ndiRuleMatches(INetFwRules* rules, const std::wstring& bridgePath) {
  INetFwRule* rule = nullptr;
  if (!readRule(rules, kNdiRule, &rule)) return false;
  long protocol = -1;
  BSTR app = nullptr;
  const bool ok = commonRuleMatches(rule) &&
                  SUCCEEDED(rule->get_Protocol(&protocol)) && protocol == NET_FW_IP_PROTOCOL_ANY &&
                  SUCCEEDED(rule->get_ApplicationName(&app)) && bstrEquals(app, bridgePath);
  if (app) SysFreeString(app);
  releaseCom(rule);
  return ok;
}

bool lanRuleMatches(INetFwRules* rules, long port) {
  INetFwRule* rule = nullptr;
  if (!readRule(rules, kLanRule, &rule)) return false;
  long protocol = -1;
  BSTR ports = nullptr;
  const std::wstring expected = std::to_wstring(port);
  const bool ok = commonRuleMatches(rule) &&
                  SUCCEEDED(rule->get_Protocol(&protocol)) && protocol == NET_FW_IP_PROTOCOL_TCP &&
                  SUCCEEDED(rule->get_LocalPorts(&ports)) && bstrEquals(ports, expected);
  if (ports) SysFreeString(ports);
  releaseCom(rule);
  return ok;
}

HRESULT removeOwnedRule(INetFwRules* rules, const wchar_t* name) {
  BSTR bname = SysAllocString(name);
  HRESULT hr = rules->Remove(bname);
  SysFreeString(bname);
  if (hr == HRESULT_FROM_WIN32(ERROR_FILE_NOT_FOUND)) return S_OK;
  return hr;
}

HRESULT setCommonRule(INetFwRule* rule, const wchar_t* name, const wchar_t* description) {
  BSTR bname = SysAllocString(name);
  BSTR bdesc = SysAllocString(description);
  BSTR bremote = SysAllocString(kRemoteScope);
  HRESULT hr = rule->put_Name(bname);
  if (SUCCEEDED(hr)) hr = rule->put_Description(bdesc);
  if (SUCCEEDED(hr)) hr = rule->put_Direction(NET_FW_RULE_DIR_IN);
  if (SUCCEEDED(hr)) hr = rule->put_Action(NET_FW_ACTION_ALLOW);
  if (SUCCEEDED(hr)) hr = rule->put_Enabled(VARIANT_TRUE);
  if (SUCCEEDED(hr)) hr = rule->put_Profiles(kProfiles);
  if (SUCCEEDED(hr)) hr = rule->put_RemoteAddresses(bremote);
  if (SUCCEEDED(hr)) hr = rule->put_EdgeTraversal(VARIANT_FALSE);
  SysFreeString(bname); SysFreeString(bdesc); SysFreeString(bremote);
  return hr;
}

HRESULT addNdiRule(INetFwRules* rules, const std::wstring& bridgePath) {
  INetFwRule* rule = nullptr;
  HRESULT hr = CoCreateInstance(__uuidof(NetFwRule), nullptr, CLSCTX_INPROC_SERVER,
                                __uuidof(INetFwRule), reinterpret_cast<void**>(&rule));
  if (FAILED(hr)) return hr;
  hr = setCommonRule(rule, kNdiRule, L"GEC NDI High Bandwidth sender access for the local production network.");
  BSTR app = SysAllocString(bridgePath.c_str());
  if (SUCCEEDED(hr)) hr = rule->put_ApplicationName(app);
  if (SUCCEEDED(hr)) hr = rule->put_Protocol(NET_FW_IP_PROTOCOL_ANY);
  SysFreeString(app);
  if (SUCCEEDED(hr)) hr = rules->Add(rule);
  releaseCom(rule);
  return hr;
}

HRESULT addLanRule(INetFwRules* rules, long port) {
  INetFwRule* rule = nullptr;
  HRESULT hr = CoCreateInstance(__uuidof(NetFwRule), nullptr, CLSCTX_INPROC_SERVER,
                                __uuidof(INetFwRule), reinterpret_cast<void**>(&rule));
  if (FAILED(hr)) return hr;
  hr = setCommonRule(rule, kLanRule, L"GEC Output LAN browser/OBS access for the local production network.");
  if (SUCCEEDED(hr)) hr = rule->put_Protocol(NET_FW_IP_PROTOCOL_TCP);
  const std::wstring portText = std::to_wstring(port);
  BSTR ports = SysAllocString(portText.c_str());
  if (SUCCEEDED(hr)) hr = rule->put_LocalPorts(ports);
  SysFreeString(ports);
  if (SUCCEEDED(hr)) hr = rules->Add(rule);
  releaseCom(rule);
  return hr;
}

void printStatus(bool ok, bool ndi, bool lan, long port, bool elevated, const char* error = nullptr, long code = 0) {
  std::cout << "{\"ok\":" << (ok ? "true" : "false")
            << ",\"supported\":true"
            << ",\"ndiConfigured\":" << (ndi ? "true" : "false")
            << ",\"lanConfigured\":" << (lan ? "true" : "false")
            << ",\"configured\":" << ((ndi && lan) ? "true" : "false")
            << ",\"lanPort\":" << port
            << ",\"elevated\":" << (elevated ? "true" : "false");
  if (error) std::cout << ",\"error\":\"" << error << "\",\"code\":" << code;
  std::cout << "}" << std::endl;
}
}

int wmain(int argc, wchar_t** argv) {
  if (hasArg(argc, argv, L"--self-test")) {
    std::cout << "{\"ok\":true,\"mode\":\"self-test\",\"supported\":true}" << std::endl;
    return 0;
  }

  const bool configure = hasArg(argc, argv, L"--configure");
  const bool status = hasArg(argc, argv, L"--status");
  if (!configure && !status) {
    std::cerr << "Use --status, --configure or --self-test." << std::endl;
    return 2;
  }

  const std::wstring bridgePath = argValue(argc, argv, L"--bridge");
  long port = 0;
  if (!validBridgePath(bridgePath, configure) || !parsePort(argValue(argc, argv, L"--lan-port"), port)) {
    printStatus(false, false, false, port, isElevated(), "invalid-arguments", ERROR_INVALID_PARAMETER);
    return 2;
  }

  if (configure && !isElevated()) {
    printStatus(false, false, false, port, false, "elevation-required", ERROR_ELEVATION_REQUIRED);
    return 5;
  }

  ComInit com;
  if (FAILED(com.hr) && com.hr != RPC_E_CHANGED_MODE) {
    printStatus(false, false, false, port, isElevated(), "com-init", static_cast<long>(com.hr));
    return 6;
  }

  INetFwPolicy2* policy = nullptr;
  INetFwRules* rules = nullptr;
  HRESULT hr = openPolicy(&policy, &rules);
  if (FAILED(hr)) {
    printStatus(false, false, false, port, isElevated(), "firewall-open", static_cast<long>(hr));
    releaseCom(rules); releaseCom(policy);
    return 7;
  }

  if (configure) {
    hr = removeOwnedRule(rules, kNdiRule);
    if (SUCCEEDED(hr)) hr = removeOwnedRule(rules, kLanRule);
    if (SUCCEEDED(hr)) hr = addNdiRule(rules, bridgePath);
    if (SUCCEEDED(hr)) hr = addLanRule(rules, port);
    if (FAILED(hr)) {
      const bool ndi = ndiRuleMatches(rules, bridgePath);
      const bool lan = lanRuleMatches(rules, port);
      printStatus(false, ndi, lan, port, true, "firewall-modify", static_cast<long>(hr));
      releaseCom(rules); releaseCom(policy);
      return 8;
    }
  }

  const bool ndi = ndiRuleMatches(rules, bridgePath);
  const bool lan = lanRuleMatches(rules, port);
  printStatus(true, ndi, lan, port, isElevated());
  releaseCom(rules); releaseCom(policy);
  return (configure && !(ndi && lan)) ? 9 : 0;
}
