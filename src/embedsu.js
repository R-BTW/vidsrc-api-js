  import fetch from 'node-fetch';
import { languageMap } from './languages.js';
import HttpProxyAgent from 'http-proxy-agent'; // Import the proxy agent

export async function getEmbedSu(tmdb_id, s, e) {
  const DOMAIN = "https://embed.su";
  const headers = {
    'User-Agent': "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    'Referer': DOMAIN,
    'Origin': DOMAIN,
  };

  // Proxy list (use the proxies you provided, simplified here)
  const proxies = [
    { ip: "223.242.222.175", port: "1080", protocol: "http" }, // China, Hefei
    { ip: "23.82.137.162", port: "80", protocol: "http" },     // US, Miami
    { ip: "120.28.139.29", port: "8081", protocol: "http" },   // Philippines, Caloocan City
    { ip: "94.249.220.135", port: "49200", protocol: "http" }, // Germany, Bad Homburg
    // Add the remaining proxies from your list here (you provided 22 total)
  ];

  // Function to select a proxy (e.g., round-robin or random)
  function selectProxy() {
    const proxy = proxies[Math.floor(Math.random() * proxies.length)];
    return `${proxy.protocol}://${proxy.ip}:${proxy.port}`;
  }

  try {
    const proxyUrl = selectProxy();
    const proxyAgent = new HttpProxyAgent(proxyUrl); // Create proxy agent

    const urlSearch = s && e ? `${DOMAIN}/embed/tv/${tmdb_id}/${s}/${e}` : `${DOMAIN}/embed/movie/${tmdb_id}`;
    const htmlSearch = await fetch(urlSearch, { 
      method: 'GET', 
      headers, 
      agent: proxyAgent // Use proxy agent for this request
    });
    const textSearch = await htmlSearch.text();

    const hashEncodeMatch = textSearch.match(/JSON\.parse\(atob\(\`([^\`]+)/i);
    const hashEncode = hashEncodeMatch ? hashEncodeMatch[1] : "";

    if (!hashEncode) return;

    const hashDecode = JSON.parse(await stringAtob(hashEncode));
    const mEncrypt = hashDecode.hash;
    if (!mEncrypt) return;

    const firstDecode = (await stringAtob(mEncrypt)).split(".").map(item => item.split("").reverse().join(""));
    const secondDecode = JSON.parse(await stringAtob(firstDecode.join("").split("").reverse().join("")));

    if (!secondDecode || secondDecode.length === 0) return;

    const sources = [];
    const subtitles = [];

    for (const item of secondDecode) {
      if (item.name.toLowerCase() !== "viper") continue;

      const urlDirect = `${DOMAIN}/api/e/${item.hash}`;
      const dataDirect = await requestGet(urlDirect, {
        "Referer": DOMAIN,
        "User-Agent": headers['User-Agent'],
        "Accept": "*/*"
      }, proxyAgent); // Pass proxy agent to requestGet

      if (!dataDirect.source) continue;

      const tracks = dataDirect.subtitles.map(sub => ({
        url: sub.file,
        lang: languageMap[sub.label.split(' ')[0]] || sub.label
      })).filter(track => track.lang);

      const requestDirectSize = await fetch(dataDirect.source, { headers, method: "GET", agent: proxyAgent }); // Use proxy for this fetch
      const parseRequest = await requestDirectSize.text();

      const patternSize = parseRequest.split('\n').filter(item => item.includes('/proxy/'));

      const directQuality = patternSize.map(patternItem => {
        const sizeQuality = getSizeQuality(patternItem);
        let dURL = `${DOMAIN}${patternItem}`;
        dURL = dURL.replace("embed.su/api/proxy/viper/", "").replace(".png", ".m3u8");
        return { file: dURL, type: 'hls', quality: `${sizeQuality}p`, lang: 'en' };
      });

      if (!directQuality.length) continue;

      sources.push({
        provider: "EmbedSu",
        files: directQuality,
        headers: {
          "Referer": DOMAIN,
          "User-Agent": headers['User-Agent'],
          "Origin": DOMAIN
        }
      });

      subtitles.push(...tracks);
    }

    return {
      sources,
      subtitles
    };
  } catch (e) {
    console.error("Error in getEmbedSu:", e);
    return { provider: "EmbedSu", sources: [], subtitles: [] };
  }
}

function getSizeQuality(url) {
  const parts = url.split('/');
  const base64Part = parts[parts.length - 2];
  const decodedPart = atob(base64Part);
  const sizeQuality = Number(decodedPart) || 1080;
  return sizeQuality;
}

async function stringAtob(input) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let str = input.replace(/=+$/, '');
  let output = '';

  if (str.length % 4 === 1) {
    throw new Error("'atob' failed: The string to be decoded is not correctly encoded.");
  }

  for (let bc = 0, bs = 0, buffer, i = 0; buffer = str.charAt(i++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
    buffer = chars.indexOf(buffer);
  }

  return output;
}

async function requestGet(url, headers = {}, proxyAgent) {
  try {
    const response = await fetch(url, { 
      method: 'GET', 
      headers, 
      agent: proxyAgent // Use proxy agent for this request
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error in requestGet:", error);
    return "";
  }
}
