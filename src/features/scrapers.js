// src/features/scrapers.js — Third-party scrapers for media, search, AI, and utilities
const https = require('https');
const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

// --- HTTP helpers ---
function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const options = {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        ...headers,
      },
      timeout: 15000,
    };
    const req = mod.request(url, options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.headers['content-type']?.includes('json')) {
          try { resolve(JSON.parse(data)); }
          catch { resolve({ raw: data }); }
        } else {
          resolve({ raw: data, status: res.statusCode });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

function httpPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const bodyStr = JSON.stringify(body);
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...headers,
      },
      timeout: 15000,
    };
    const req = mod.request(url, options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(bodyStr);
    req.end();
  });
}

// --- 1. NPM Search ---
async function searchNpm(query, limit = 10) {
  const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=${limit}`;
  const res = await httpGet(url);
  if (res.objects) {
    return res.objects.map(o => ({
      name: o.package.name,
      description: o.package.description || '',
      version: o.package.version,
      author: o.package.authors?.[0]?.name || '',
      keywords: o.package.keywords || [],
      url: `https://npmjs.com/package/${o.package.name}`,
      score: o.score?.final || 0,
    }));
  }
  return [];
}

async function npmPackageInfo(name) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(name)}`;
  const res = await httpGet(url);
  if (res.error) return null;
  const distTags = res['dist-tags'] || {};
  const latest = distTags.latest || Object.keys(res.versions).pop();
  const info = res.versions?.[latest] || {};
  return {
    name: res.name,
    description: res.description || '',
    version: latest,
    authors: (res.author || res.maintainers || []).map(a => typeof a === 'string' ? a : a.name).filter(Boolean),
    keywords: res.keywords || [],
    license: info.license || res.license || 'unknown',
    repository: res.repository?.url || '',
    homepage: res.homepage || '',
    dependencies: Object.keys(info.dependencies || {}),
    homepageUrl: `https://npmjs.com/package/${res.name}`,
    downloads: res.downloads?.lastMonth || 0,
  };
}

// --- 2. Spotify ---
async function searchSpotify(query) {
  try {
    const res = await httpGet(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`, {
      'Authorization': 'Bearer dummy', // Would need real API key
    });
    if (res.tracks?.items) {
      return res.tracks.items.map(t => ({
        name: t.name,
        artist: t.artists.map(a => a.name).join(', '),
        album: t.album.name,
        duration: t.duration_ms,
        url: t.external_urls?.spotify,
        preview: t.preview_url,
        image: t.album.images?.[0]?.url || '',
      }));
    }
  } catch {}
  // Fallback: use spotifyloader.com
  try {
    const res = await httpGet(`https://api.spotifyloader.com/api/search?q=${encodeURIComponent(query)}`);
    if (res.success && res.data) return res.data;
  } catch {}
  return [];
}

async function spotifyTrackInfo(uri) {
  try {
    const res = await httpGet(`https://api.spotify.com/v1/tracks?ids=${encodeURIComponent(uri)}`, {
      'Authorization': 'Bearer dummy',
    });
    if (res.tracks?.[0]) {
      const t = res.tracks[0];
      return {
        name: t.name,
        artists: t.artists.map(a => a.name).join(', '),
        album: t.album.name,
        duration: t.duration_ms,
        url: t.external_urls?.spotify,
        image: t.album.images?.[0]?.url || '',
        explicit: t.explicit,
      };
    }
  } catch {}
  return null;
}

// --- 3. Pinterest Download ---
async function pinterestSearch(query) {
  try {
    const res = await httpGet(`https://www.pinterest.com/resource/BaseSearchResource/get/?source_url=/search/pins/?q=${encodeURIComponent(query)}&data=${encodeURIComponent(JSON.stringify({options: {query, isPrefetch: false}, context: {}}))}`, {
      'User-Agent': 'Mozilla/5.0',
      'X-Pinterest-App-Version': 'web',
      'X-Requested-With': 'XMLHttpRequest',
    });
    if (res.resource_response?.results?.overview) {
      return res.resource_response.results.overview.map(p => ({
        title: p.title || '',
        desc: p.descriptions?.[0] || '',
        link: p.link || '',
        id: p.id || '',
        imageUrl: p.images?.orig?.url || p.images?.['236x']?.url || '',
        author: p.pinner?.username || '',
      }));
    }
  } catch {}
  return [];
}

async function pinterestDownload(pinUrl) {
  try {
    const res = await httpGet(pinUrl);
    // Extract image URLs from page
    const matches = res.raw?.match(/https:\/\/i\.pinimg\.com\/[^"\']+\.jpg/g) || [];
    const unique = [...new Set(matches)];
    return unique.slice(0, 5);
  } catch {
    return [];
  }
}

// --- 4. YouTube Search & Download ---
async function youtubeSearch(query, limit = 10) {
  try {
    const res = await httpGet(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`);
    // Extract video data from YouTube page
    const videos = [];
    const regex = /"videoId":"([^"]+)".*"title":\{"runs":\[\{"text":"([^"]+)"}\].*"ownerText":\{"runs":\[\{"text":"([^"]+)"}\]\].*"shortBylineText":\{"runs":\[\{"text":"([^"]+)"}\]\].*"lengthText":\{"text":"([^"]+)"}.*?"viewCountText":\{"simpleText":"([^"]+)"/gs;
    let match;
    while ((match = regex.exec(res.raw)) && videos.length < limit) {
      videos.push({
        id: match[1],
        title: match[2],
        channel: match[3] || match[4],
        duration: match[5] || '',
        views: match[6] || '',
        url: `https://www.youtube.com/watch?v=${match[1]}`,
        thumb: `https://i.ytimg.com/vi/${match[1]}/hqdefault.jpg`,
      });
    }
    return videos;
  } catch {
    return [];
  }
}

async function ytmp3(videoUrl) {
  try {
    const res = await httpGet(`https://www.ytmp3.cc/api/fetch?url=${encodeURIComponent(videoUrl)}`);
    if (res.data || res.url) {
      return {
        title: res.title || 'Unknown',
        url: res.data || res.url,
        size: res.size || '',
      };
    }
  } catch {}
  return null;
}

async function youtubeInfo(videoId) {
  try {
    const res = await httpGet(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    return {
      title: res.title,
      author: res.author_name,
      thumbnail: res.thumbnail_url,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      duration: '',
    };
  } catch {
    return null;
  }
}

// --- 5. Telegram Downloader ---
async function telegramDownload(url) {
  try {
    const res = await httpGet(url);
    // Extract media URLs from Telegram web page
    const mediaUrls = [];
    const imgRegex = /https:\/\/[^"\s]+\.(jpg|jpeg|png|gif|webp)/gi;
    const videoRegex = /https:\/\/[^"\s]+\.(mp4|webm|ogg)/gi;
    const imgs = res.raw?.match(imgRegex) || [];
    const videos = res.raw?.match(videoRegex) || [];
    return [...new Set([...imgs, ...videos])].slice(0, 10);
  } catch {
    return { error: 'Failed to fetch Telegram page' };
  }
}

// --- 6. Web Page Fetch ---
async function fetchPageSource(url) {
  try {
    const res = await httpGet(`https://view-page-source.com/view-source?url=${encodeURIComponent(url)}`);
    return { source: res.raw || '', url };
  } catch {
    return { error: 'Failed to fetch page source' };
  }
}

// --- 7. AI Models (Qwen) ---
async function qwenChat(prompt, options = {}) {
  try {
    const res = await httpPost('https://tools.kaminoater.top/ai/qwen', {
      prompt,
      model: options.model || 'qwen',
      max_tokens: options.maxTokens || 2000,
    });
    return res;
  } catch (err) {
    return { error: err.message };
  }
}

async function qwenVision(imageBase64, prompt) {
  try {
    const res = await httpPost('https://tools.kaminoater.top/ai/vision', {
      image: imageBase64,
      prompt,
      model: 'qwen-vl',
    });
    return res;
  } catch (err) {
    return { error: err.message };
  }
}

async function qwenTextToImage(prompt) {
  try {
    const res = await httpPost('https://tools.kaminoater.top/ai/text-to-image', {
      prompt,
      model: 'qwen-image',
    });
    return res;
  } catch (err) {
    return { error: err.message };
  }
}

// --- 8. AlightMotion ---
async function alightMotionSearch(query) {
  try {
    const res = await httpGet(`https://znn-alightmotion.vercel.app/api/search?q=${encodeURIComponent(query)}`);
    return res.results || [];
  } catch {
    return [];
  }
}

async function alightMotionEffects() {
  try {
    const res = await httpGet('https://znn-alightmotion.vercel.app/api/effects');
    return res.effects || [];
  } catch {
    return [];
  }
}

// --- 9. Temp Mail ---
let tempMailAccounts = new Map();

async function createTempEmail() {
  try {
    const res = await httpGet('https://api.temp-mail.io/emails');
    if (res.email) {
      tempMailAccounts.set(res.email, res.token);
      return { email: res.email, token: res.token };
    }
  } catch {}
  // Fallback
  return {
    email: `temp_${Date.now()}@mail.tm`,
    token: Math.random().toString(36).slice(2),
    inbox: [],
  };
}

async function checkTempMail(email, token) {
  try {
    const res = await httpGet(`https://api.temp-mail.io/emails/${encodeURIComponent(email)}/inbox?token=${token}`);
    const messages = res.messages || [];
    return messages.map(m => ({
      from: m.from,
      subject: m.subject,
      date: m.date,
      body: m.body || m.text || '',
    }));
  } catch {
    return [];
  }
}

// --- 10. General Scrapers ---
async function scrapeWebpage(url) {
  try {
    const res = await httpGet(url);
    const text = res.raw || '';
    // Extract title
    const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
    // Extract links
    const links = [...new Set([...text.matchAll(/href=["'](.*?)["']/gi)].map(m => m[1]))];
    // Extract images
    const images = [...new Set([...text.matchAll(/src=["'](.*?)["']/gi)].map(m => m[1]))];
    return {
      url,
      title: titleMatch?.[1]?.trim() || '',
      links: links.filter(l => l.startsWith('http')).slice(0, 20),
      images: images.filter(i => i.startsWith('http') || i.startsWith('/')).slice(0, 20),
      textLength: text.length,
    };
  } catch {
    return { error: 'Failed to scrape page' };
  }
}

async function googleSearch(query, limit = 10) {
  try {
    const res = await httpGet(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
    const results = [];
    const titleRegex = /<h3[^>]*>([^<]+)<\/h3>/gi;
    const linkRegex = /href="\/url\?q=([^&"]+)/gi;
    const descRegex = /<span[^>]*>([^<]{50,200})<\/span>/gi;
    
    const titles = [...res.raw.matchAll(titleRegex)].map(m => m[1].trim());
    const linksArr = [...res.raw.matchAll(linkRegex)].map(m => decodeURIComponent(m[1]));
    const descs = [...res.raw.matchAll(descRegex)].slice(0, limit);
    
    for (let i = 0; i < Math.min(titles.length, linksArr.length, limit); i++) {
      results.push({
        title: titles[i],
        url: linksArr[i],
        snippet: descs[i]?.[1]?.trim() || '',
      });
    }
    return results;
  } catch {
    return [];
  }
}

module.exports = {
  // NPM
  searchNpm,
  npmPackageInfo,
  
  // Spotify
  searchSpotify,
  spotifyTrackInfo,
  
  // Pinterest
  pinterestSearch,
  pinterestDownload,
  
  // YouTube
  youtubeSearch,
  ytmp3,
  youtubeInfo,
  
  // Telegram
  telegramDownload,
  
  // Web
  fetchPageSource,
  scrapeWebpage,
  googleSearch,
  
  // AI
  qwenChat,
  qwenVision,
  qwenTextToImage,
  
  // AlightMotion
  alightMotionSearch,
  alightMotionEffects,
  
  // Temp Mail
  createTempEmail,
  checkTempMail,
};
