#define NOMINMAX
#include <windows.h>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>
#include <thread>
#include <atomic>
#include <chrono>
#include <algorithm>

using NDIlib_send_instance_t = void*;

static constexpr int64_t NDIlib_send_timecode_synthesize = INT64_MAX;
static constexpr uint32_t fourcc(char a,char b,char c,char d){
    return (uint32_t)(uint8_t)a | ((uint32_t)(uint8_t)b<<8) | ((uint32_t)(uint8_t)c<<16) | ((uint32_t)(uint8_t)d<<24);
}
static constexpr uint32_t NDI_BGRA = fourcc('B','G','R','A');
static constexpr uint32_t NDI_FLTP = fourcc('F','L','T','p');
static constexpr int NDI_PROGRESSIVE = 1;

struct NDIlib_send_create_t {
    const char* p_ndi_name;
    const char* p_groups;
    bool clock_video;
    bool clock_audio;
};
struct NDIlib_video_frame_v2_t {
    int xres, yres;
    uint32_t FourCC;
    int frame_rate_N, frame_rate_D;
    float picture_aspect_ratio;
    int frame_format_type;
    int64_t timecode;
    uint8_t* p_data;
    int line_stride_in_bytes;
    const char* p_metadata;
    int64_t timestamp;
};
struct NDIlib_audio_frame_v3_t {
    int sample_rate;
    int no_channels;
    int no_samples;
    int64_t timecode;
    uint32_t FourCC;
    uint8_t* p_data;
    int channel_stride_in_bytes;
    const char* p_metadata;
    int64_t timestamp;
};

using FnInitialize = bool (__cdecl*)();
using FnDestroy = void (__cdecl*)();
using FnSendCreate = NDIlib_send_instance_t (__cdecl*)(const NDIlib_send_create_t*);
using FnSendDestroy = void (__cdecl*)(NDIlib_send_instance_t);
using FnSendVideo = void (__cdecl*)(NDIlib_send_instance_t,const NDIlib_video_frame_v2_t*);
using FnSendAudio = void (__cdecl*)(NDIlib_send_instance_t,const NDIlib_audio_frame_v3_t*);
using FnConnections = int (__cdecl*)(NDIlib_send_instance_t,uint32_t);

static std::string jsonEscape(const std::string& in){
    std::string out; out.reserve(in.size()+16);
    for(unsigned char c:in){
        switch(c){
            case '\\': out+="\\\\"; break;
            case '"': out+="\\\""; break;
            case '\n': out+="\\n"; break;
            case '\r': out+="\\r"; break;
            case '\t': out+="\\t"; break;
            default:
                if(c<0x20){ char b[8]; std::snprintf(b,sizeof(b),"\\u%04x",c); out+=b; }
                else out.push_back((char)c);
        }
    }
    return out;
}
static std::string utf8(const std::wstring& ws){
    if(ws.empty()) return {};
    int n=WideCharToMultiByte(CP_UTF8,0,ws.c_str(),(int)ws.size(),nullptr,0,nullptr,nullptr);
    std::string s((size_t)n,'\0');
    WideCharToMultiByte(CP_UTF8,0,ws.c_str(),(int)ws.size(),s.data(),n,nullptr,nullptr);
    return s;
}
static void emit(const char* type,const std::string& message="",int value=-999,const std::wstring& path=L""){
    std::fprintf(stderr,"{\"type\":\"%s\"",type);
    if(!message.empty()) std::fprintf(stderr,",\"message\":\"%s\"",jsonEscape(message).c_str());
    if(value!=-999) std::fprintf(stderr,",\"value\":%d",value);
    if(!path.empty()) std::fprintf(stderr,",\"path\":\"%s\"",jsonEscape(utf8(path)).c_str());
    std::fprintf(stderr,"}\n");
    std::fflush(stderr);
}
static std::wstring envw(const wchar_t* key){
    DWORD n=GetEnvironmentVariableW(key,nullptr,0); if(!n) return {};
    std::wstring out((size_t)n,L'\0');
    DWORD got=GetEnvironmentVariableW(key,out.data(),n);
    if(!got) return {};
    out.resize(got); return out;
}
static bool existsFile(const std::wstring& p){
    DWORD a=GetFileAttributesW(p.c_str());
    return a!=INVALID_FILE_ATTRIBUTES && !(a&FILE_ATTRIBUTE_DIRECTORY);
}
static std::wstring join(const std::wstring& a,const std::wstring& b){
    if(a.empty()) return b;
    wchar_t c=a.back(); return a+(c==L'\\'||c==L'/'?L"":L"\\")+b;
}
static std::wstring exeDir(){
    std::wstring p(32768,L'\0'); DWORD n=GetModuleFileNameW(nullptr,p.data(),(DWORD)p.size());
    p.resize(n); size_t i=p.find_last_of(L"\\/"); return i==std::wstring::npos?L"":p.substr(0,i);
}
static void addCandidate(std::vector<std::wstring>& out,const std::wstring& p){
    if(p.empty()) return;
    if(p.size()>=4 && _wcsicmp(p.c_str()+p.size()-4,L".dll")==0) out.push_back(p);
    else out.push_back(join(p,L"Processing.NDI.Lib.x64.dll"));
}
static std::vector<std::wstring> runtimeCandidates(){
    std::vector<std::wstring> c;
    addCandidate(c,envw(L"GEC_NDI_RUNTIME_DIR"));
    addCandidate(c,envw(L"NDI_RUNTIME_DIR_V6"));
    addCandidate(c,envw(L"NDI_RUNTIME_DIR_V5"));
    addCandidate(c,exeDir());
    const auto pf=envw(L"ProgramFiles"),pd=envw(L"ProgramData"),ad=envw(L"APPDATA");
    if(!pf.empty()){
        addCandidate(c,join(pf,L"NDI\\NDI 6 Runtime\\v6"));
        addCandidate(c,join(pf,L"NDI\\NDI 6 Runtime"));
        addCandidate(c,join(pf,L"NDI\\NDI 5 Runtime\\v5"));
        addCandidate(c,join(pf,L"NDI\\NDI 5 Runtime"));
        addCandidate(c,join(pf,L"NDI\\NDI Tools"));
        addCandidate(c,join(pf,L"obs-studio\\obs-plugins\\64bit"));
        addCandidate(c,join(pf,L"DistroAV\\bin\\64bit"));
    }
    if(!pd.empty()) addCandidate(c,join(pd,L"obs-studio\\plugins\\DistroAV\\bin\\64bit"));
    if(!ad.empty()) addCandidate(c,join(ad,L"obs-studio\\plugins\\DistroAV\\bin\\64bit"));
    std::vector<std::wstring> unique;
    for(const auto& p:c) if(std::find(unique.begin(),unique.end(),p)==unique.end()) unique.push_back(p);
    return unique;
}
static HMODULE loadNdi(std::wstring& loadedPath){
    for(const auto& p:runtimeCandidates()){
        if(!existsFile(p)) continue;
        HMODULE h=LoadLibraryExW(p.c_str(),nullptr,LOAD_WITH_ALTERED_SEARCH_PATH);
        if(h){loadedPath=p;return h;}
    }
    HMODULE h=LoadLibraryW(L"Processing.NDI.Lib.x64.dll");
    if(h){loadedPath=L"Processing.NDI.Lib.x64.dll";return h;}
    return nullptr;
}
template<class T> static T sym(HMODULE h,const char* name){ return reinterpret_cast<T>(GetProcAddress(h,name)); }

#pragma pack(push,1)
struct PacketHeader {
    char magic[4];
    uint32_t version;
    uint32_t type;
    uint32_t a;
    uint32_t b;
    uint32_t c;
    uint32_t bytes;
};
#pragma pack(pop)
static bool readExact(HANDLE h,void* dst,size_t bytes){
    uint8_t* p=(uint8_t*)dst; size_t done=0;
    while(done<bytes){
        DWORD got=0,ask=(DWORD)std::min<size_t>(bytes-done,1u<<20);
        if(!ReadFile(h,p+done,ask,&got,nullptr) || got==0) return false;
        done+=got;
    }
    return true;
}
static bool argEq(const wchar_t* a,const wchar_t* b){return _wcsicmp(a,b)==0;}

int wmain(int argc,wchar_t** argv){
    SetErrorMode(SEM_FAILCRITICALERRORS|SEM_NOGPFAULTERRORBOX|SEM_NOOPENFILEERRORBOX);
    std::wstring name=L"GEC Automatic News - OUTPUT";
    int fps=30; bool audio=true,selfTest=false;
    for(int i=1;i<argc;i++){
        if(argEq(argv[i],L"--self-test")) selfTest=true;
        else if(argEq(argv[i],L"--name")&&i+1<argc) name=argv[++i];
        else if(argEq(argv[i],L"--fps")&&i+1<argc) fps=std::max(1,std::min(60,_wtoi(argv[++i])));
        else if(argEq(argv[i],L"--audio")&&i+1<argc) audio=_wtoi(argv[++i])!=0;
    }
    if(selfTest){
        const bool sizes=sizeof(NDIlib_video_frame_v2_t)>=64 && sizeof(NDIlib_audio_frame_v3_t)>=56 && sizeof(PacketHeader)==28;
        std::printf("{\"ok\":%s,\"protocol\":1,\"videoStruct\":%zu,\"audioStruct\":%zu,\"packetHeader\":%zu}\n",sizes?"true":"false",sizeof(NDIlib_video_frame_v2_t),sizeof(NDIlib_audio_frame_v3_t),sizeof(PacketHeader));
        return sizes?0:2;
    }
    std::wstring dllPath; HMODULE dll=loadNdi(dllPath);
    if(!dll){ emit("error","NDI Runtime no encontrado. Instala NDI Tools/Runtime o define NDI_RUNTIME_DIR_V6.",10); return 10; }
    auto initialize=sym<FnInitialize>(dll,"NDIlib_initialize");
    auto destroy=sym<FnDestroy>(dll,"NDIlib_destroy");
    auto sendCreate=sym<FnSendCreate>(dll,"NDIlib_send_create");
    auto sendDestroy=sym<FnSendDestroy>(dll,"NDIlib_send_destroy");
    auto sendVideo=sym<FnSendVideo>(dll,"NDIlib_send_send_video_v2");
    auto sendAudio=sym<FnSendAudio>(dll,"NDIlib_send_send_audio_v3");
    auto getConnections=sym<FnConnections>(dll,"NDIlib_send_get_no_connections");
    if(!initialize||!destroy||!sendCreate||!sendDestroy||!sendVideo||!sendAudio){
        emit("error","La biblioteca NDI encontrada no expone la API de envío requerida.",11,dllPath);
        FreeLibrary(dll); return 11;
    }
    if(!initialize()){ emit("error","NDIlib_initialize falló.",12,dllPath); FreeLibrary(dll); return 12; }
    std::string name8=utf8(name);
    NDIlib_send_create_t create{}; create.p_ndi_name=name8.c_str(); create.p_groups=nullptr; create.clock_video=false; create.clock_audio=false;
    NDIlib_send_instance_t sender=sendCreate(&create);
    if(!sender){ emit("error","No se pudo crear el sender NDI.",13,dllPath); destroy(); FreeLibrary(dll); return 13; }

    std::atomic<bool> running{true};
    std::thread monitor;
    if(getConnections){
        monitor=std::thread([&](){
            int last=-999;
            while(running.load()){
                int n=getConnections(sender,0);
                if(n!=last){ emit("connections","",n); last=n; }
                for(int i=0;i<10&&running.load();i++) std::this_thread::sleep_for(std::chrono::milliseconds(100));
            }
        });
    }
    emit("ready",name8,fps,dllPath);

    HANDLE in=GetStdHandle(STD_INPUT_HANDLE);
    std::vector<uint8_t> payload;
    PacketHeader h{};
    while(readExact(in,&h,sizeof(h))){
        if(std::memcmp(h.magic,"GECN",4)!=0||h.version!=1){ emit("error","Protocolo NDI bridge inválido.",20); break; }
        if(h.bytes>64u*1024u*1024u){ emit("error","Paquete demasiado grande.",21); break; }
        payload.resize(h.bytes);
        if(h.bytes&&!readExact(in,payload.data(),payload.size())) break;
        if(h.type==1){
            const uint32_t w=h.a,hh=h.b,frameFps=h.c?h.c:(uint32_t)fps;
            const uint64_t expected=(uint64_t)w*(uint64_t)hh*4ull;
            if(w<16||hh<16||w>4096||hh>4096||expected!=h.bytes) continue;
            NDIlib_video_frame_v2_t f{};
            f.xres=(int)w;f.yres=(int)hh;f.FourCC=NDI_BGRA;
            f.frame_rate_N=(int)frameFps;f.frame_rate_D=1;
            f.picture_aspect_ratio=(float)w/(float)hh;f.frame_format_type=NDI_PROGRESSIVE;
            f.timecode=NDIlib_send_timecode_synthesize;f.p_data=payload.data();
            f.line_stride_in_bytes=(int)w*4;f.p_metadata=nullptr;f.timestamp=0;
            sendVideo(sender,&f);
        } else if(h.type==2 && audio){
            const uint32_t rate=h.a,channels=h.b,samples=h.c;
            const uint64_t expected=(uint64_t)channels*(uint64_t)samples*sizeof(float);
            if(rate<8000||rate>192000||channels<1||channels>8||samples<1||samples>8192||expected!=h.bytes) continue;
            NDIlib_audio_frame_v3_t f{};
            f.sample_rate=(int)rate;f.no_channels=(int)channels;f.no_samples=(int)samples;
            f.timecode=NDIlib_send_timecode_synthesize;f.FourCC=NDI_FLTP;f.p_data=payload.data();
            f.channel_stride_in_bytes=(int)samples*(int)sizeof(float);f.p_metadata=nullptr;f.timestamp=0;
            sendAudio(sender,&f);
        }
    }
    running.store(false); if(monitor.joinable()) monitor.join();
    sendDestroy(sender); destroy(); FreeLibrary(dll);
    emit("stopped","NDI bridge finalizado.");
    return 0;
}
