// WebP Converter AI
// This script powers a simple client‑side tool that accepts images,
// estimates a sensible WebP quality based on visual complexity,
// optionally iterates to meet a target size, and allows the user to
// download each converted image individually or all at once.

(() => {
  const fileSelect = document.getElementById('fileSelect');
  const fileElem = document.getElementById('fileElem');
  const dropArea = document.getElementById('drop-area');
  const preview = document.getElementById('preview');
  const convertAllBtn = document.getElementById('convertAll');
  const downloadAllBtn = document.getElementById('downloadAll');
  const targetSizeInput = document.getElementById('targetSize');

  // Store info about each file
  const fileEntries = [];

  fileSelect.addEventListener('click', () => fileElem.click());
  fileElem.addEventListener('change', (e) => {
    handleFiles(e.target.files);
  });

  ;['dragenter','dragover','dragleave','drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  });
  dropArea.addEventListener('dragover', () => dropArea.classList.add('dragover'));
  dropArea.addEventListener('dragleave', () => dropArea.classList.remove('dragover'));
  dropArea.addEventListener('drop', (e) => {
    dropArea.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length) {
      handleFiles(e.dataTransfer.files);
    }
  });

  function handleFiles(files) {
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataURL = ev.target.result;
        const img = new Image();
        img.onload = () => {
          const complexity = computeComplexity(img);
          const suggestedQuality = Math.round(60 + (90 - 60) * complexity);
          const entry = {
            file,
            img,
            quality: suggestedQuality,
            convertedBlob: null
          };
          fileEntries.push(entry);
          createCard(entry);
        };
        img.src = dataURL;
      };
      reader.readAsDataURL(file);
    });
  }

  function computeComplexity(image) {
    // Draw the image to a temporary canvas and compute a simple
    // per‑pixel difference measure between neighbouring pixels. This
    // approximates edge density / texture complexity. The result is
    // normalized to [0,1].
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    // Downscale large images to limit work; preserve aspect ratio
    const maxDim = 256;
    let scale = 1;
    if (Math.max(width, height) > maxDim) {
      scale = maxDim / Math.max(width, height);
    }
    const w = Math.floor(width * scale);
    const h = Math.floor(height * scale);
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(image, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    let diffSum = 0;
    let maxDiff = 0;
    for (let i = 0; i < data.length - 4; i += 4) {
      const dr = Math.abs(data[i] - data[i + 4]);
      const dg = Math.abs(data[i + 1] - data[i + 5]);
      const db = Math.abs(data[i + 2] - data[i + 6]);
      const diff = dr + dg + db;
      diffSum += diff;
      maxDiff += 765; // 255 * 3
    }
    const complexity = diffSum / maxDiff;
    return complexity;
  }

  function createCard(entry) {
    const card = document.createElement('div');
    card.className = 'card';
    const imgEl = document.createElement('img');
    imgEl.src = entry.img.src;
    card.appendChild(imgEl);
    const label = document.createElement('label');
    label.textContent = `Calidad sugerida: ${entry.quality}`;
    card.appendChild(label);
    const range = document.createElement('input');
    range.type = 'range';
    range.min = 30;
    range.max = 100;
    range.value = entry.quality;
    range.addEventListener('input', () => {
      entry.quality = parseInt(range.value, 10);
      label.textContent = `Calidad: ${entry.quality}`;
    });
    card.appendChild(range);
    const convertBtn = document.createElement('button');
    convertBtn.textContent = 'Convertir';
    convertBtn.className = 'convert-btn';
    convertBtn.addEventListener('click', async () => {
      convertBtn.disabled = true;
      await convertEntry(entry);
      convertBtn.disabled = false;
    });
    card.appendChild(convertBtn);
    const downloadBtn = document.createElement('button');
    downloadBtn.textContent = 'Descargar';
    downloadBtn.className = 'download-btn';
    downloadBtn.disabled = true;
    downloadBtn.addEventListener('click', () => {
      if (entry.convertedBlob) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(entry.convertedBlob);
        const ext = entry.file.name.split('.').slice(0, -1).join('.') || entry.file.name;
        a.download = `${ext}.webp`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    });
    card.appendChild(downloadBtn);
    entry.card = card;
    entry.range = range;
    entry.convertBtn = convertBtn;
    entry.downloadBtn = downloadBtn;
    preview.appendChild(card);
  }

  async function convertEntry(entry) {
    // Convert a single entry to WebP using the chosen quality and target size
    const targetKb = parseInt(targetSizeInput.value, 10);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = entry.img.naturalWidth;
    canvas.height = entry.img.naturalHeight;
    ctx.drawImage(entry.img, 0, 0);
    let quality = entry.quality / 100;
    let blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    if (!isNaN(targetKb) && targetKb > 0) {
      // Reduce quality gradually until under target size
      let q = quality;
      while (blob.size > targetKb * 1024 && q > 0.2) {
        q -= 0.05;
        blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', q));
      }
      quality = q;
    }
    entry.convertedBlob = blob;
    entry.downloadBtn.disabled = false;
    // Show info update
    entry.card.querySelector('label').textContent = `Calidad usada: ${Math.round(quality * 100)}`;
  }

  convertAllBtn.addEventListener('click', async () => {
    convertAllBtn.disabled = true;
    for (const entry of fileEntries) {
      if (!entry.convertedBlob) {
        await convertEntry(entry);
      }
    }
    convertAllBtn.disabled = false;
  });

  downloadAllBtn.addEventListener('click', () => {
    downloadAllBtn.disabled = true;
    let idx = 0;
    function next() {
      if (idx < fileEntries.length) {
        const entry = fileEntries[idx++];
        if (entry.convertedBlob) {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(entry.convertedBlob);
          const ext = entry.file.name.split('.').slice(0, -1).join('.') || entry.file.name;
          a.download = `${ext}.webp`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          // Wait briefly before next download to allow browsers to handle multiple downloads
          setTimeout(next, 500);
        } else {
          // If not converted yet, convert first then download
          convertEntry(entry).then(() => {
            next();
          });
        }
      } else {
        downloadAllBtn.disabled = false;
      }
    }
    next();
  });
})();
