'use strict';

// 0.3.24 compatibility bootstrap: patch the shared article fetcher before
// main.js destructures it, so Noticias, manual review and Automático all use
// the same corrected public/subscriber classification.
const article=require('./services/article');
const {correctAccess}=require('./services/accessPolicy0324');
const baseFetchArticle=article.fetchArticle;
article.fetchArticle=async function fetchArticle0324(url){
  const result=await baseFetchArticle(url);
  return correctAccess(result,url);
};

require('./main');
