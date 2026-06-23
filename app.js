const outputFormats = {
  wide: { label: "16:9 Cover", suffix: "Cover_L_I", width: 1920, height: 1080 },
  bannerLarge: { label: "Banner L", suffix: "Cover_H_PC_I", width: 1332, height: 404 },
  bannerMedium: { label: "Banner M", suffix: "Cover_H_Tab_I", width: 814, height: 262 },
  bannerSmall: { label: "Banner S", suffix: "Cover_H_MB_I", width: 560, height: 207 },
};

const backgroundFormat = { label: "Background", suffix: "Background_L_I", width: 1920, height: 1080 };
const GEMINI_MODEL = "gemini-3.1-flash-image";
const GEMINI_API_VERSION = "v1beta";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/${GEMINI_API_VERSION}/models/${GEMINI_MODEL}:generateContent`;

const geminiTargetSpecs = {
  wide: {
    name: "16:9 horizontal cover",
    width: 1920,
    height: 1080,
    ratio: "16:9",
    composition:
      "a purpose-made wide story cover with the title near the top center, generous sky behind the title, and the main characters and props arranged across the middle and lower area",
  },
  bannerLarge: {
    name: "large platform banner",
    width: 1332,
    height: 404,
    ratio: "1332:404, about 3.30:1",
    composition:
      "an ultra-wide banner with a readable title in the central safe area and the complete main characters and important props distributed around the center without crowding the top or bottom edges",
  },
  bannerMedium: {
    name: "medium platform banner",
    width: 814,
    height: 262,
    ratio: "814:262, about 3.11:1",
    composition:
      "a moderately wide banner with a slightly tighter composition than the large banner, keeping the title large and legible and keeping the same main characters and props visible",
  },
  bannerSmall: {
    name: "small platform banner",
    width: 560,
    height: 207,
    ratio: "560:207, about 2.71:1",
    composition:
      "a compact wide banner with the clearest possible title and a simplified but faithful arrangement of the same characters and key props",
  },
  background: {
    name: "clean story background plate",
    width: 1920,
    height: 1080,
    ratio: "16:9",
    composition:
      "a clean 16:9 background-only illustration matching the uploaded scene's camera angle, environment, lighting, color palette, and visual style",
  },
};

const $ = (id) => document.getElementById(id);

const portraitInput = $("portraitInput");
const storyIdInput = $("storyIdInput");
const apiKeyInput = $("apiKeyInput");
const generationStatus = $("generationStatus");
const previewShell = $("previewShell");
const coverCanvas = $("coverCanvas");
const coverEmpty = $("coverEmpty");
const sourceStatus = $("sourceStatus");
const bannerFocusSelect = $("bannerFocusSelect");
const coverScaleRange = $("coverScaleRange");
const coverXRange = $("coverXRange");
const coverYRange = $("coverYRange");
const resetCoverButton = $("resetCoverButton");
const downloadAllButton = $("downloadAllButton");
const formatCards = [...document.querySelectorAll(".format-card")];
const formatSelectButtons = [...document.querySelectorAll(".format-select")];
const generateButtons = [...document.querySelectorAll(".generate-format")];
const downloadButtons = [...document.querySelectorAll(".download-format")];
const historyNavs = [...document.querySelectorAll(".format-card .history-nav")];

const profileInput = $("profileInput");
const profileCanvas = $("profileCanvas");
const profileContext = profileCanvas.getContext("2d");
const profileEmpty = $("profileEmpty");
const profileStatus = $("profileStatus");
const profileStatusText = $("profileStatusText");
const profileZoomRange = $("profileZoomRange");
const profileXRange = $("profileXRange");
const profileYRange = $("profileYRange");
const resetProfileButton = $("resetProfileButton");
const downloadProfileButton = $("downloadProfileButton");
const backgroundInput = $("backgroundInput");
const backgroundCanvas = $("backgroundCanvas");
const backgroundEmpty = $("backgroundEmpty");
const backgroundStatus = $("backgroundStatus");
const generateBackgroundButton = $("generateBackgroundButton");
const downloadBackgroundButton = $("downloadBackgroundButton");
const backgroundHistoryNav = $("backgroundHistoryNav");

let portraitPayload = null;
let generatedHistory = createEmptyHistory();
let selectedHistoryIndex = createEmptyHistoryIndex();
let selectedFormat = "wide";
let isGenerating = false;
let backgroundPayload = null;
let backgroundHistory = [];
let selectedBackgroundIndex = -1;
let profileImage = null;
let profileBaseScale = 1;
let profileState = {
  scaleFactor: 1,
  x: 0,
  y: 0,
};
let profileDrag = null;
const isLocalFileMode = window.location.protocol === "file:";

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => resolve({ image, dataUrl: reader.result });
      image.onerror = reject;
      image.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImageFromBase64(data, mimeType) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = `data:${mimeType};base64,${data}`;
  });
}

function cleanBase64(dataUrl) {
  return String(dataUrl).replace(/^data:[^;]+;base64,/, "");
}

function createEmptyHistory() {
  return Object.fromEntries(Object.keys(outputFormats).map((formatKey) => [formatKey, []]));
}

function createEmptyHistoryIndex() {
  return Object.fromEntries(Object.keys(outputFormats).map((formatKey) => [formatKey, -1]));
}

function sanitizeStoryId() {
  const value = storyIdInput.value.trim();
  return (value || "story").replace(/[^a-z0-9_-]+/gi, "_").replace(/^_+|_+$/g, "") || "story";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hasGeneratedImage() {
  return Object.keys(outputFormats).some((formatKey) => Boolean(currentGeneratedImage(formatKey)));
}

function selectedOutput() {
  return outputFormats[selectedFormat];
}

function currentGeneratedImage(formatKey) {
  const index = selectedHistoryIndex[formatKey];
  return index >= 0 ? generatedHistory[formatKey]?.[index] || null : null;
}

function currentBackgroundImage() {
  return selectedBackgroundIndex >= 0 ? backgroundHistory[selectedBackgroundIndex] || null : null;
}

function setStatus(message, isError = false, isLoading = false) {
  generationStatus.textContent = message;
  generationStatus.classList.toggle("error", isError);
  generationStatus.classList.toggle("loading", isLoading);
}

function setProfileStatus(message, isError = false, isLoading = false) {
  profileStatusText.textContent = message;
  profileStatus.classList.toggle("error", isError);
  profileStatus.classList.toggle("loading", isLoading);
}

function setBackgroundStatus(message, isError = false, isLoading = false) {
  backgroundStatus.textContent = message;
  backgroundStatus.classList.toggle("error", isError);
  backgroundStatus.classList.toggle("loading", isLoading);
}

function isLocationUnsupported(message) {
  return /user location is not supported|location.*not supported/i.test(message || "");
}

function imagePrompt({ jobType, storyId }) {
  const spec = geminiTargetSpecs[jobType] || geminiTargetSpecs.wide;
  const id = storyId?.trim() || "the story id";

  if (jobType === "background") {
    return [
      "Use the uploaded story scene image as the visual reference.",
      `Story ID for filename only: ${id}. Do not render this Story ID anywhere in the image.`,
      `Create a new ${spec.name} composed specifically for ${spec.width}x${spec.height}px.`,
      `Target aspect ratio: ${spec.ratio}.`,
      spec.composition,
      "Remove all characters, people, animals, mascots, body parts, faces, and character-held foreground props.",
      "Reconstruct and repaint the background areas that were hidden behind the removed characters so the scene looks complete and naturally illustrated.",
      "Preserve the same setting, architecture, plants, furniture, ground, sky, atmosphere, lighting direction, lens perspective, and illustration style from the reference.",
      "Do not stretch, squeeze, warp, crop, zoom, pad, letterbox, pillarbox, blur-extend, or place the original image inside a new canvas.",
      "Do not add any title, text, captions, logos, labels, watermarks, UI, or new characters.",
      "The final image must look like an original clean background plate for animation or storybook production.",
    ].join("\n");
  }

  const sharedRules = [
    "Use the uploaded 3:4 portrait book cover as the visual reference.",
    `Story ID for filename only: ${id}. Do not render this Story ID anywhere in the image.`,
    "The original cover already contains the story title. Recreate the exact visible title text from the reference cover, in the same title style, without changing the wording.",
    "ABSOLUTELY FORBIDDEN: do not stretch, squeeze, warp, resize, crop, zoom, pad, letterbox, pillarbox, blur-extend, background-fill, or place the original cover inside a wider canvas.",
    "ABSOLUTELY FORBIDDEN: do not make a ratio-converted version of the uploaded cover or any previous generated image.",
    "You must create a fully regenerated illustration composed natively for the requested target canvas.",
    "Preserve the exact story identity: same main characters, same character count, same species, same costumes, same important props, same environment, same visual style, same color palette, and same mood.",
    "You may adjust character placement, spacing, and scale to fit the target banner, but do not replace, redesign, omit, or add important characters or props.",
    "Extend and repaint the scene naturally with newly generated scenery so it looks originally illustrated for this target size.",
    "Keep faces, heads, hands, limbs, animals, and important props complete and away from the crop edges.",
    "No extra logos, labels, watermarks, captions, subtitles, UI, or decorative text.",
    "Leave a safe margin around all title letters so no word touches the top, bottom, left, or right edge.",
  ];

  if (jobType !== "wide") {
    return [
      ...sharedRules,
      `Create a new ${spec.name} composed specifically for ${spec.width}x${spec.height}px.`,
      `Target aspect ratio: ${spec.ratio}.`,
      spec.composition,
      "This is a separate native regeneration for this exact banner size, not a crop or resize from another banner.",
      "Use the available vertical space carefully: title must remain readable, and characters must not be squeezed or cut off.",
      "Prefer a clean readable title area over decorative clutter.",
    ].join("\n");
  }

  return [
    ...sharedRules,
    `Create a new ${spec.name} composed specifically for ${spec.width}x${spec.height}px.`,
    `Target aspect ratio: ${spec.ratio}.`,
    spec.composition,
  ].join("\n");
}

function buildGeminiPayload(payload) {
  return {
    contents: [
      {
        role: "user",
        parts: [
          { text: imagePrompt(payload) },
          {
            inline_data: {
              mime_type: payload.mimeType,
              data: cleanBase64(payload.imageData),
            },
          },
        ],
      },
    ],
  };
}

function parseGeminiResult(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((part) => part.inlineData || part.inline_data);
  const textPart = parts.find((part) => part.text);
  const inlineData = imagePart?.inlineData || imagePart?.inline_data;

  if (!inlineData?.data) {
    throw new Error(textPart?.text || "Gemini returned no image. Try again with a slightly different prompt.");
  }

  return {
    mimeType: inlineData.mimeType || inlineData.mime_type || "image/png",
    data: inlineData.data,
    note: textPart?.text || "",
  };
}

async function requestGeminiDirect(payload) {
  const apiResponse = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": payload.apiKey,
    },
    body: JSON.stringify(buildGeminiPayload(payload)),
  });

  const text = await apiResponse.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!apiResponse.ok) {
    throw new Error(data?.error?.message || `Gemini API error: ${apiResponse.status}`);
  }

  return parseGeminiResult(data);
}

async function requestGeminiImage(payload) {
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  let result;
  try {
    result = await response.json();
  } catch {
    result = {};
  }

  if (!response.ok) {
    const message = result.error || "Gemini generation failed.";
    if (isLocationUnsupported(message)) {
      return requestGeminiDirect(payload);
    }
    throw new Error(message);
  }

  return result;
}

function updatePreviewShape() {
  const format = selectedOutput();
  previewShell.style.aspectRatio = `${format.width} / ${format.height}`;
}

function clearCoverPreview() {
  const format = selectedOutput();
  coverCanvas.width = format.width;
  coverCanvas.height = format.height;
  const ctx = coverCanvas.getContext("2d");
  ctx.clearRect(0, 0, coverCanvas.width, coverCanvas.height);
  coverEmpty.classList.remove("hidden");
}

function setCoverButtonsEnabled() {
  const canGenerate = Boolean(portraitPayload) && Boolean(apiKeyInput.value.trim()) && !isLocalFileMode && !isGenerating;

  generateButtons.forEach((button) => {
    button.disabled = !canGenerate;
  });

  downloadButtons.forEach((button) => {
    const formatKey = button.dataset.format;
    button.disabled = !currentGeneratedImage(formatKey) || isGenerating;
  });

  downloadAllButton.disabled = !(hasGeneratedImage() || profileImage || currentBackgroundImage()) || isGenerating;
  setBackgroundButtonsEnabled();
  renderHistoryNavs();
}

function setProfileButtonsEnabled(enabled) {
  resetProfileButton.disabled = !enabled;
  downloadProfileButton.disabled = !enabled;
}

function setBackgroundButtonsEnabled() {
  const canGenerate = Boolean(backgroundPayload) && Boolean(apiKeyInput.value.trim()) && !isLocalFileMode && !isGenerating;
  generateBackgroundButton.disabled = !canGenerate;
  downloadBackgroundButton.disabled = !currentBackgroundImage() || isGenerating;
  renderBackgroundHistoryNav();
}

function drawImageCover(ctx, image, x, y, width, height, focusX = 0.5, focusY = 0.5) {
  const sourceRatio = image.width / image.height;
  const targetRatio = width / height;
  let sw = image.width;
  let sh = image.height;

  if (sourceRatio > targetRatio) {
    sw = image.height * targetRatio;
  } else {
    sh = image.width / targetRatio;
  }

  const sx = clamp((image.width - sw) * focusX, 0, image.width - sw);
  const sy = clamp((image.height - sh) * focusY, 0, image.height - sh);
  ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
}

function bannerFocusY() {
  const focus = bannerFocusSelect.value;
  if (focus === "top") return 0.18;
  if (focus === "middleLow") return 0.48;
  if (focus === "bottom") return 0.7;
  return 0.5;
}

function currentTransform(formatKey) {
  const isBanner = formatKey !== "wide";
  return {
    scale: Number(coverScaleRange.value) / 100,
    focusX: clamp(0.5 + Number(coverXRange.value) / 100, 0, 1),
    focusY: isBanner ? bannerFocusY() : clamp(0.5 + Number(coverYRange.value) / 100, 0, 1),
  };
}

function renderFormat(targetCanvas, formatKey) {
  const image = currentGeneratedImage(formatKey);
  if (!image) return false;

  const format = outputFormats[formatKey];
  const transform = currentTransform(formatKey);
  const ctx = targetCanvas.getContext("2d");
  targetCanvas.width = format.width;
  targetCanvas.height = format.height;
  ctx.clearRect(0, 0, format.width, format.height);

  const scaledWidth = format.width * transform.scale;
  const scaledHeight = format.height * transform.scale;
  const x = (format.width - scaledWidth) / 2;
  const y = (format.height - scaledHeight) / 2;
  drawImageCover(ctx, image, x, y, scaledWidth, scaledHeight, transform.focusX, transform.focusY);
  return true;
}

function renderCoverPreview() {
  updatePreviewShape();
  const rendered = renderFormat(coverCanvas, selectedFormat);

  if (rendered) {
    coverEmpty.classList.add("hidden");
  } else {
    clearCoverPreview();
  }

  updateSourceStatus();
}

function updateSourceStatus() {
  const format = selectedOutput();
  const image = currentGeneratedImage(selectedFormat);
  if (image) {
    const selectedNumber = selectedHistoryIndex[selectedFormat] + 1;
    const total = generatedHistory[selectedFormat].length;
    sourceStatus.textContent = `생성본: ${format.label} 후보 ${selectedNumber}/${total} / 저장 규격 ${format.width} x ${format.height}`;
  } else if (portraitPayload) {
    sourceStatus.textContent = `${format.label}은 아직 생성되지 않았습니다. 카드의 생성 버튼을 누르세요.`;
  } else {
    sourceStatus.textContent = `선택된 규격: ${format.label}`;
  }
}

function renderHistoryNavs() {
  historyNavs.forEach((nav) => {
    const formatKey = nav.dataset.format;
    nav.replaceChildren();

    generatedHistory[formatKey].forEach((_, index) => {
      const button = document.createElement("button");
      button.className = "history-button";
      button.type = "button";
      button.textContent = String(index + 1);
      button.title = `${outputFormats[formatKey].label} 후보 ${index + 1}`;
      button.classList.toggle("active", selectedHistoryIndex[formatKey] === index);
      button.disabled = isGenerating;
      button.addEventListener("click", () => selectGeneratedCandidate(formatKey, index));
      nav.appendChild(button);
    });
  });
}

function selectGeneratedCandidate(formatKey, index) {
  selectedHistoryIndex[formatKey] = index;
  activateFormatButton(formatKey);
  setCoverButtonsEnabled();
  renderHistoryNavs();
}

function renderBackgroundHistoryNav() {
  backgroundHistoryNav.replaceChildren();

  backgroundHistory.forEach((_, index) => {
    const button = document.createElement("button");
    button.className = "history-button";
    button.type = "button";
    button.textContent = String(index + 1);
    button.title = `배경 후보 ${index + 1}`;
    button.classList.toggle("active", selectedBackgroundIndex === index);
    button.disabled = isGenerating;
    button.addEventListener("click", () => selectBackgroundCandidate(index));
    backgroundHistoryNav.appendChild(button);
  });
}

function selectBackgroundCandidate(index) {
  selectedBackgroundIndex = index;
  renderBackground();
  backgroundEmpty.classList.toggle("hidden", Boolean(currentBackgroundImage()));
  setBackgroundStatus(`배경 후보 ${index + 1}/${backgroundHistory.length}을 선택했습니다.`);
  setCoverButtonsEnabled();
  renderBackgroundHistoryNav();
}

function activateFormatButton(formatKey) {
  selectedFormat = formatKey;
  formatCards.forEach((card) => {
    card.classList.toggle("active", card.dataset.format === formatKey);
  });
  renderCoverPreview();
  renderHistoryNavs();
}

async function requestGeneration(formatKey) {
  if (isLocalFileMode) {
    setStatus("run.bat로 실행한 화면에서만 Gemini 재생성을 사용할 수 있습니다.", true);
    return;
  }

  if (!portraitPayload) {
    setStatus("먼저 3:4 표지를 업로드하세요.", true);
    return;
  }

  const format = outputFormats[formatKey];
  isGenerating = true;
  setCoverButtonsEnabled();
  activateFormatButton(formatKey);
  setStatus(`Gemini가 ${format.label} 전용 새 구도를 생성 중입니다.`, false, true);

  try {
    const result = await requestGeminiImage({
      jobType: formatKey,
      storyId: storyIdInput.value.trim(),
      apiKey: apiKeyInput.value.trim(),
      mimeType: portraitPayload.mimeType,
      imageData: portraitPayload.base64,
    });

    const generatedImage = await loadImageFromBase64(result.data, result.mimeType);
    generatedHistory[formatKey].push(generatedImage);
    selectedHistoryIndex[formatKey] = generatedHistory[formatKey].length - 1;
    setStatus(result.note ? `${format.label} 생성이 완료되었습니다. ${result.note}` : `${format.label} 생성이 완료되었습니다.`);
    renderCoverPreview();
    renderHistoryNavs();
  } catch (error) {
    const message = error.message || "Gemini generation failed.";
    const isFetchFailure =
      message === "Failed to fetch" || message === "NetworkError when attempting to fetch resource.";
    const hint =
      isFetchFailure
        ? `Failed to fetch: 현재 주소가 ${window.location.href}입니다. 페이지를 새로고침하고 API Key와 네트워크 연결을 확인하세요. 로컬 실행 중이라면 http://localhost:포트번호 주소에서 열어야 합니다.`
        : message;
    setStatus(hint, true);
  } finally {
    isGenerating = false;
    setCoverButtonsEnabled();
  }
}

function downloadCanvas(canvas, fileName) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, "image/png");
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(target, offset, value) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(target, offset, value) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

async function createZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = new Uint8Array(await file.blob.arrayBuffer());
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length);
    writeUint32(local, 0, 0x04034b50);
    writeUint16(local, 4, 20);
    writeUint16(local, 6, 0);
    writeUint16(local, 8, 0);
    writeUint16(local, 10, 0);
    writeUint16(local, 12, 0);
    writeUint32(local, 14, crc);
    writeUint32(local, 18, data.length);
    writeUint32(local, 22, data.length);
    writeUint16(local, 26, nameBytes.length);
    writeUint16(local, 28, 0);
    local.set(nameBytes, 30);

    localParts.push(local, data);

    const central = new Uint8Array(46 + nameBytes.length);
    writeUint32(central, 0, 0x02014b50);
    writeUint16(central, 4, 20);
    writeUint16(central, 6, 20);
    writeUint16(central, 8, 0);
    writeUint16(central, 10, 0);
    writeUint16(central, 12, 0);
    writeUint16(central, 14, 0);
    writeUint32(central, 16, crc);
    writeUint32(central, 20, data.length);
    writeUint32(central, 24, data.length);
    writeUint16(central, 28, nameBytes.length);
    writeUint16(central, 30, 0);
    writeUint16(central, 32, 0);
    writeUint16(central, 34, 0);
    writeUint16(central, 36, 0);
    writeUint32(central, 38, 0);
    writeUint32(central, 42, offset);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length + data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  writeUint32(end, 0, 0x06054b50);
  writeUint16(end, 4, 0);
  writeUint16(end, 6, 0);
  writeUint16(end, 8, files.length);
  writeUint16(end, 10, files.length);
  writeUint32(end, 12, centralSize);
  writeUint32(end, 16, offset);
  writeUint16(end, 20, 0);

  return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
}

function downloadCover(formatKey) {
  if (!currentGeneratedImage(formatKey)) {
    setStatus(`${outputFormats[formatKey].label} 생성본이 없습니다. 먼저 생성하세요.`, true);
    return;
  }

  const exportCanvas = document.createElement("canvas");
  renderFormat(exportCanvas, formatKey);
  downloadCanvas(exportCanvas, `${sanitizeStoryId()}_${outputFormats[formatKey].suffix}.png`);
}

async function collectZipFiles() {
  const storyId = sanitizeStoryId();
  const files = [];

  for (const formatKey of Object.keys(outputFormats)) {
    if (!currentGeneratedImage(formatKey)) continue;
    const canvas = document.createElement("canvas");
    renderFormat(canvas, formatKey);
    const blob = await canvasToBlob(canvas);
    if (blob) {
      files.push({
        name: `${storyId}_${outputFormats[formatKey].suffix}.png`,
        blob,
      });
    }
  }

  if (currentBackgroundImage()) {
    const canvas = document.createElement("canvas");
    renderBackground(canvas);
    const blob = await canvasToBlob(canvas);
    if (blob) {
      files.push({
        name: `${storyId}_${backgroundFormat.suffix}.png`,
        blob,
      });
    }
  }

  const profileCanvasExport = renderProfileExport();
  if (profileCanvasExport) {
    const blob = await canvasToBlob(profileCanvasExport);
    if (blob) {
      files.push({
        name: `${storyId}_Talking_P_I.png`,
        blob,
      });
    }
  }

  return files;
}

async function downloadAllZip() {
  const files = await collectZipFiles();
  if (!files.length) {
    setStatus("저장할 생성본이나 프로필 이미지가 없습니다.", true);
    return;
  }

  const zip = await createZip(files);
  downloadBlob(zip, `${sanitizeStoryId()}_Assets.zip`);
  setStatus(`ZIP 저장이 완료되었습니다. ${files.length}개 파일을 포함했습니다.`);
}

function clearBackgroundPreview() {
  backgroundCanvas.width = backgroundFormat.width;
  backgroundCanvas.height = backgroundFormat.height;
  const ctx = backgroundCanvas.getContext("2d");
  ctx.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
  backgroundEmpty.classList.remove("hidden");
}

function renderBackground(targetCanvas = backgroundCanvas) {
  const image = currentBackgroundImage();
  if (!image) return false;
  targetCanvas.width = backgroundFormat.width;
  targetCanvas.height = backgroundFormat.height;
  const ctx = targetCanvas.getContext("2d");
  ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  drawImageCover(ctx, image, 0, 0, targetCanvas.width, targetCanvas.height);
  return true;
}

async function requestBackgroundGeneration() {
  if (isLocalFileMode) {
    setBackgroundStatus("run.bat로 실행한 화면에서만 Gemini 배경 재추출을 사용할 수 있습니다.", true);
    return;
  }

  if (!backgroundPayload) {
    setBackgroundStatus("먼저 동화 속 장면 이미지를 업로드하세요.", true);
    return;
  }

  isGenerating = true;
  setCoverButtonsEnabled();
  setBackgroundStatus("Gemini가 캐릭터를 제거하고 16:9 배경을 재추출 중입니다.", false, true);

  try {
    const result = await requestGeminiImage({
      jobType: "background",
      storyId: storyIdInput.value.trim(),
      apiKey: apiKeyInput.value.trim(),
      mimeType: backgroundPayload.mimeType,
      imageData: backgroundPayload.base64,
    });

    const generatedBackground = await loadImageFromBase64(result.data, result.mimeType);
    backgroundHistory.push(generatedBackground);
    selectedBackgroundIndex = backgroundHistory.length - 1;
    renderBackground();
    renderBackgroundHistoryNav();
    backgroundEmpty.classList.add("hidden");
    setBackgroundStatus(result.note
      ? `배경 후보 ${backgroundHistory.length} 생성이 완료되었습니다. ${result.note}`
      : `배경 후보 ${backgroundHistory.length} 생성이 완료되었습니다.`);
  } catch (error) {
    const message = error.message || "Background generation failed.";
    const isFetchFailure =
      message === "Failed to fetch" || message === "NetworkError when attempting to fetch resource.";
    setBackgroundStatus(isFetchFailure
      ? `Failed to fetch: 현재 주소가 ${window.location.href}입니다. 페이지를 새로고침하고 API Key와 네트워크 연결을 확인하세요. 로컬 실행 중이라면 http://localhost:포트번호 주소에서 열어야 합니다.`
      : message, true);
  } finally {
    isGenerating = false;
    setCoverButtonsEnabled();
  }
}

function downloadBackground() {
  if (!currentBackgroundImage()) {
    setBackgroundStatus("저장할 배경 생성본이 없습니다. 먼저 배경 생성을 누르세요.", true);
    return;
  }

  const exportCanvas = document.createElement("canvas");
  renderBackground(exportCanvas);
  downloadCanvas(exportCanvas, `${sanitizeStoryId()}_${backgroundFormat.suffix}.png`);
  setBackgroundStatus("배경 이미지를 저장했습니다.");
}

function resetCoverControls() {
  generatedHistory = createEmptyHistory();
  selectedHistoryIndex = createEmptyHistoryIndex();
  bannerFocusSelect.value = "center";
  coverScaleRange.value = "100";
  coverXRange.value = "0";
  coverYRange.value = "0";
  setCoverButtonsEnabled();
  renderCoverPreview();
  renderHistoryNavs();
  setStatus(portraitPayload ? "생성본을 초기화했습니다. 필요한 규격을 다시 생성하세요." : "3:4 표지를 업로드하세요.");
}

portraitInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const loaded = await loadImageFromFile(file);
  portraitPayload = {
    mimeType: file.type || "image/png",
    base64: cleanBase64(loaded.dataUrl),
  };
  generatedHistory = createEmptyHistory();
  selectedHistoryIndex = createEmptyHistoryIndex();

  setCoverButtonsEnabled();
  renderCoverPreview();
  renderHistoryNavs();
  if (isLocalFileMode) {
    setStatus("표지를 업로드했습니다. Gemini 재생성은 run.bat로 실행한 화면에서만 사용할 수 있습니다.", true);
  } else {
    setStatus("표지를 업로드했습니다. 각 규격 카드의 생성 버튼을 눌러 새 이미지를 만드세요.");
  }
});

backgroundInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const loaded = await loadImageFromFile(file);
  backgroundPayload = {
    mimeType: file.type || "image/png",
    base64: cleanBase64(loaded.dataUrl),
  };
  backgroundHistory = [];
  selectedBackgroundIndex = -1;
  renderBackgroundHistoryNav();
  clearBackgroundPreview();
  setBackgroundStatus(isLocalFileMode
    ? "장면 이미지를 업로드했습니다. 배경 재추출은 run.bat로 실행한 화면에서만 사용할 수 있습니다."
    : "장면 이미지를 업로드했습니다. 배경 생성을 누르면 캐릭터를 제거한 16:9 배경을 만듭니다.", isLocalFileMode);
  setCoverButtonsEnabled();
});

apiKeyInput.addEventListener("input", setCoverButtonsEnabled);

formatSelectButtons.forEach((button) => {
  const card = button.closest(".format-card");
  button.addEventListener("click", () => activateFormatButton(card.dataset.format));
});

generateButtons.forEach((button) => {
  button.addEventListener("click", () => requestGeneration(button.dataset.format));
});

downloadButtons.forEach((button) => {
  button.addEventListener("click", () => downloadCover(button.dataset.format));
});

[bannerFocusSelect, coverScaleRange, coverXRange, coverYRange].forEach((control) => {
  control.addEventListener("input", renderCoverPreview);
});

resetCoverButton.addEventListener("click", resetCoverControls);
downloadAllButton.addEventListener("click", downloadAllZip);
generateBackgroundButton.addEventListener("click", requestBackgroundGeneration);
downloadBackgroundButton.addEventListener("click", downloadBackground);

function calculateProfileBaseScale() {
  return Math.max(600 / profileImage.width, 600 / profileImage.height);
}

function resetProfileState() {
  if (!profileImage) return;
  profileBaseScale = calculateProfileBaseScale();
  profileState.scaleFactor = 1;
  profileState.x = (600 - profileImage.width * profileBaseScale) / 2;
  profileState.y = (600 - profileImage.height * profileBaseScale) / 2;
  syncProfileControls();
  renderProfile();
  setProfileStatus("크롭 위치를 초기화했습니다. 원 안에서 위치와 확대를 조정하세요.");
}

function syncProfileControls() {
  profileZoomRange.value = String(Math.round(profileState.scaleFactor * 100));
  profileXRange.value = String(Math.round(profileState.x));
  profileYRange.value = String(Math.round(profileState.y));
}

function profileScale() {
  return profileBaseScale * profileState.scaleFactor;
}

function drawProfileImage(ctx, multiplier = 1) {
  const scale = profileScale() * multiplier;
  ctx.drawImage(
    profileImage,
    profileState.x * multiplier,
    profileState.y * multiplier,
    profileImage.width * scale,
    profileImage.height * scale,
  );
}

function renderProfile() {
  profileContext.clearRect(0, 0, profileCanvas.width, profileCanvas.height);
  drawChecker(profileContext, profileCanvas.width, profileCanvas.height);

  if (!profileImage) return;
  const multiplier = profileCanvas.width / 600;
  profileContext.save();
  profileContext.beginPath();
  profileContext.arc(profileCanvas.width / 2, profileCanvas.height / 2, profileCanvas.width / 2, 0, Math.PI * 2);
  profileContext.clip();
  drawProfileImage(profileContext, multiplier);
  profileContext.restore();

  profileContext.save();
  profileContext.fillStyle = "rgba(17, 24, 39, 0.55)";
  profileContext.beginPath();
  profileContext.rect(0, 0, profileCanvas.width, profileCanvas.height);
  profileContext.arc(profileCanvas.width / 2, profileCanvas.height / 2, profileCanvas.width / 2 - 2, 0, Math.PI * 2, true);
  profileContext.fill("evenodd");
  profileContext.restore();
}

function drawChecker(ctx, width, height) {
  const size = 20;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      if ((x / size + y / size) % 2 === 0) {
        ctx.fillStyle = "#e5e7eb";
        ctx.fillRect(x, y, size, size);
      }
    }
  }
}

function renderProfileExport() {
  if (!profileImage) return null;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = 600;
  exportCanvas.height = 600;
  const ctx = exportCanvas.getContext("2d");
  ctx.clearRect(0, 0, 600, 600);
  ctx.save();
  ctx.beginPath();
  ctx.arc(300, 300, 300, 0, Math.PI * 2);
  ctx.clip();
  drawProfileImage(ctx, 1);
  ctx.restore();
  return exportCanvas;
}

profileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  setProfileStatus("인물 이미지를 불러오는 중입니다.", false, true);
  try {
    const loaded = await loadImageFromFile(file);
    profileImage = loaded.image;
    profileEmpty.classList.add("hidden");
    setProfileButtonsEnabled(true);
    setCoverButtonsEnabled();
    resetProfileState();
    setProfileStatus("인물 이미지를 업로드했습니다. 원 안에서 위치와 확대를 조정하세요.");
  } catch (error) {
    setProfileStatus("인물 이미지를 불러오지 못했습니다. 다른 파일로 다시 시도하세요.", true);
  }
});

profileZoomRange.addEventListener("input", () => {
  profileState.scaleFactor = Number(profileZoomRange.value) / 100;
  renderProfile();
});

profileXRange.addEventListener("input", () => {
  profileState.x = Number(profileXRange.value);
  renderProfile();
});

profileYRange.addEventListener("input", () => {
  profileState.y = Number(profileYRange.value);
  renderProfile();
});

profileCanvas.addEventListener("pointerdown", (event) => {
  if (!profileImage) return;
  profileCanvas.setPointerCapture(event.pointerId);
  profileDrag = {
    startX: event.clientX,
    startY: event.clientY,
    imageX: profileState.x,
    imageY: profileState.y,
  };
});

profileCanvas.addEventListener("pointermove", (event) => {
  if (!profileDrag) return;
  const rect = profileCanvas.getBoundingClientRect();
  const outputPerCssPixel = 600 / rect.width;
  profileState.x = profileDrag.imageX + (event.clientX - profileDrag.startX) * outputPerCssPixel;
  profileState.y = profileDrag.imageY + (event.clientY - profileDrag.startY) * outputPerCssPixel;
  syncProfileControls();
  renderProfile();
});

profileCanvas.addEventListener("pointerup", () => {
  profileDrag = null;
});

profileCanvas.addEventListener("pointercancel", () => {
  profileDrag = null;
});

profileCanvas.addEventListener("wheel", (event) => {
  if (!profileImage) return;
  event.preventDefault();
  const delta = event.deltaY > 0 ? -0.06 : 0.06;
  profileState.scaleFactor = Math.min(2.6, Math.max(0.35, profileState.scaleFactor + delta));
  syncProfileControls();
  renderProfile();
}, { passive: false });

resetProfileButton.addEventListener("click", resetProfileState);
downloadProfileButton.addEventListener("click", () => {
  const canvas = renderProfileExport();
  if (canvas) {
    downloadCanvas(canvas, `${sanitizeStoryId()}_Talking_P_I.png`);
    setProfileStatus("프로필 이미지를 저장했습니다.");
  }
});

drawChecker(profileContext, profileCanvas.width, profileCanvas.height);
setCoverButtonsEnabled();
renderCoverPreview();
renderHistoryNavs();
clearBackgroundPreview();

if (isLocalFileMode) {
  setStatus("Gemini 재생성 기능은 run.bat로 실행해야 사용할 수 있습니다.", true);
  setProfileStatus("프로필 크롭은 사용할 수 있지만, 전체 기능 확인은 run.bat로 실행한 화면에서 진행하세요.");
  setBackgroundStatus("Gemini 배경 재추출 기능은 run.bat로 실행해야 사용할 수 있습니다.", true);
}
