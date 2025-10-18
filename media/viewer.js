(function(){
  const vscode = acquireVsCodeApi();
  const canvas = document.getElementById('gfxCanvas');
  const canvasWrap = document.getElementById('canvasWrap');
  const ctx = canvas.getContext('2d', { alpha: true });
  const zoomLevelEl = document.getElementById('zoomLevel');
  const zoomInBtn = document.getElementById('zoomIn');
  const zoomOutBtn = document.getElementById('zoomOut');
  const fitBtn = document.getElementById('fit');
  const actualBtn = document.getElementById('actual');
  const saveBtn = document.getElementById('saveBtn');
  const revertBtn = document.getElementById('revertBtn');
  const flipHBtn = document.getElementById('flipHBtn');
  const flipVBtn = document.getElementById('flipVBtn');
  const rotateLeftBtn = document.getElementById('rotateLeftBtn');
  const rotateRightBtn = document.getElementById('rotateRightBtn');
  const fileNameEl = document.getElementById('fileName');
  const imageSizeEl = document.getElementById('imageSize');
  const viewOffsetCheckbox = document.getElementById('viewOffset');
  const recenterBtn = document.getElementById('recenter');
  const offsetXInput = document.getElementById('offsetXInput');
  const offsetYInput = document.getElementById('offsetYInput');
  const presetSelect = document.getElementById('presetSelect');

  let imgData = null;
  let imgWidth = 0;
  let imgHeight = 0;
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let isPanning = false;
  let lastMouseX = 0;
  let lastMouseY = 0;
  let image = null;
  let needsRender = true;
  let isDirty = false;
  let currentImageData = null;
  let canUndo = false;
  let canRedo = false;
  let offsetX = 0;
  let offsetY = 0;
  let viewOffset = false;
  let isDraggingOffset = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartOffsetX = 0;
  let dragStartOffsetY = 0;
  let customPresets = [];

  
  function resizeCanvas(){
    const rect = canvasWrap.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    needsRender = true;
  }

  function render(){
    if(!image) return;
    
    ctx.imageSmoothingEnabled = false;
    
    const bgColor1 = '#404050';
    const bgColor2 = '#383844';
    const patternSize = 8;
    
    ctx.fillStyle = bgColor1;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = bgColor2;
    for(let y = 0; y < canvas.height; y += patternSize){
      for(let x = 0; x < canvas.width; x += patternSize){
        if((Math.floor(x / patternSize) + Math.floor(y / patternSize)) % 2 === 0){
          ctx.fillRect(x, y, patternSize, patternSize);
        }
      }
    }

    const scaledWidth = imgWidth * zoom;
    const scaledHeight = imgHeight * zoom;
    
    const centerX = canvas.width / 2 + panX;
    const centerY = canvas.height / 2 + panY;
    
    let drawX, drawY;
    
    if(viewOffset){
      drawX = centerX - offsetX * zoom;
      drawY = centerY - offsetY * zoom;
    } else {
      drawX = centerX - scaledWidth / 2;
      drawY = centerY - scaledHeight / 2;
    }

    ctx.save();
    ctx.strokeStyle = 'rgba(96, 96, 96, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(drawX - 0.5, drawY - 0.5, scaledWidth + 1, scaledHeight + 1);
    ctx.restore();

    ctx.drawImage(image, drawX, drawY, scaledWidth, scaledHeight);
    
    if(viewOffset){
      ctx.save();
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      
      const crosshairX = centerX;
      const crosshairY = centerY;
      
      ctx.beginPath();
      ctx.moveTo(crosshairX, 0);
      ctx.lineTo(crosshairX, canvas.height);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(0, crosshairY);
      ctx.lineTo(canvas.width, crosshairY);
      ctx.stroke();
      
      ctx.restore();
    }
  }

  function renderLoop(){
    if(needsRender){
      render();
      needsRender = false;
    }
    requestAnimationFrame(renderLoop);
  }

  function setDirty(dirty){
    isDirty = dirty;
    saveBtn.disabled = !dirty;
    revertBtn.disabled = !dirty;
    if(dirty && currentImageData){
      vscode.postMessage({
        type: 'dirty',
        dataUri: currentImageData,
        width: imgWidth,
        height: imgHeight
      });
    }
  }

  function applyTransform(transformType){
    if(!currentImageData) return;

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    
    let newWidth = imgWidth;
    let newHeight = imgHeight;

    if(transformType === 'rotate-left' || transformType === 'rotate-right'){
      newWidth = imgHeight;
      newHeight = imgWidth;
    }

    tempCanvas.width = newWidth;
    tempCanvas.height = newHeight;

    tempCtx.imageSmoothingEnabled = false;

    if(transformType === 'flip-h'){
      tempCtx.translate(newWidth, 0);
      tempCtx.scale(-1, 1);
    } else if(transformType === 'flip-v'){
      tempCtx.translate(0, newHeight);
      tempCtx.scale(1, -1);
    } else if(transformType === 'rotate-left'){
      tempCtx.translate(0, newHeight);
      tempCtx.rotate(-Math.PI / 2);
    } else if(transformType === 'rotate-right'){
      tempCtx.translate(newWidth, 0);
      tempCtx.rotate(Math.PI / 2);
    }

    tempCtx.drawImage(image, 0, 0);

    imgWidth = newWidth;
    imgHeight = newHeight;
    
    const newDataUri = tempCanvas.toDataURL('image/png');
    currentImageData = newDataUri;
    
    image = new Image();
    image.onload = () => {
      needsRender = true;
      updateImageSize();
      setDirty(true);
    };
    image.src = newDataUri;
  }

  function updateImageSize(){
    if(imageSizeEl){
      imageSizeEl.textContent = `${imgWidth}×${imgHeight}`;
    }
  }

  function updateOffsetInputs(){
    if(offsetXInput){
      offsetXInput.value = offsetX;
    }
    if(offsetYInput){
      offsetYInput.value = offsetY;
    }
  }

  function setOffset(newX, newY, saveToHistory = true){
    if(offsetX === newX && offsetY === newY) return;
    
    offsetX = newX;
    offsetY = newY;
    updateOffsetInputs();
    needsRender = true;
    
    if(saveToHistory){
      vscode.postMessage({
        type: 'offset-changed',
        offsetX: offsetX,
        offsetY: offsetY
      });
      
      // Update UI dirty state without sending duplicate 'dirty' message
      if(!isDirty){
        isDirty = true;
        saveBtn.disabled = false;
        revertBtn.disabled = false;
      }
    }
  }

  function recenterView(){
    panX = 0;
    panY = 0;
    needsRender = true;
  }

  function applyPreset(presetName){
    if(!imgWidth || !imgHeight) return;
    
    let newOffsetX = offsetX;
    let newOffsetY = offsetY;
    
    switch(presetName){
      case 'monster':
        newOffsetX = Math.floor(imgWidth / 2);
        newOffsetY = imgHeight - 4;
        break;
      case 'monster-gl':
        newOffsetX = Math.floor(imgWidth / 2);
        newOffsetY = imgHeight;
        break;
      case 'projectile':
        newOffsetX = Math.floor(imgWidth / 2);
        newOffsetY = Math.floor(imgHeight / 2);
        break;
      default:
        const customPreset = customPresets.find(p => p.name === presetName);
        if(customPreset){
          newOffsetX = customPreset.offsetX;
          newOffsetY = customPreset.offsetY;
        }
        return;
    }
    
    setOffset(newOffsetX, newOffsetY, true);
  }

  function updatePresetsDropdown(){
    const options = Array.from(presetSelect.options);
    options.forEach(opt => {
      if(opt.dataset.custom === 'true'){
        opt.remove();
      }
    });
    
    customPresets.forEach(preset => {
      const option = document.createElement('option');
      option.value = preset.name;
      option.textContent = preset.name;
      option.dataset.custom = 'true';
      presetSelect.appendChild(option);
    });
  }

  function setZoom(newZoom, focusX, focusY){
    const oldZoom = zoom;
    zoom = Math.max(0.1, Math.min(32, newZoom));

    if(focusX !== undefined && focusY !== undefined){
      const rect = canvas.getBoundingClientRect();
      const mouseCanvasX = focusX - rect.left;
      const mouseCanvasY = focusY - rect.top;

      const beforePanX = mouseCanvasX - canvas.width / 2 - panX;
      const beforePanY = mouseCanvasY - canvas.height / 2 - panY;

      const scaleFactor = zoom / oldZoom;
      
      panX = mouseCanvasX - canvas.width / 2 - beforePanX * scaleFactor;
      panY = mouseCanvasY - canvas.height / 2 - beforePanY * scaleFactor;
    }

    zoomLevelEl.textContent = Math.round(zoom * 100) + '%';
    needsRender = true;
  }

  function zoomToFit(){
    const padding = 20;
    const availWidth = canvas.width - padding * 2;
    const availHeight = canvas.height - padding * 2;
    const scaleX = availWidth / imgWidth;
    const scaleY = availHeight / imgHeight;
    const newZoom = Math.min(scaleX, scaleY);
    panX = 0;
    panY = 0;
    setZoom(newZoom);
  }

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(zoom * delta, e.clientX, e.clientY);
  }, { passive: false });

  canvas.addEventListener('mousedown', (e) => {
    if(e.button === 1){
      e.preventDefault();
      isPanning = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      canvas.style.cursor = 'grabbing';
    } else if(e.button === 0 && viewOffset){
      const rect = canvas.getBoundingClientRect();
      const mouseCanvasX = e.clientX - rect.left;
      const mouseCanvasY = e.clientY - rect.top;
      
      const scaledWidth = imgWidth * zoom;
      const scaledHeight = imgHeight * zoom;
      
      const centerX = canvas.width / 2 + panX;
      const centerY = canvas.height / 2 + panY;
      
      const drawX = centerX - offsetX * zoom;
      const drawY = centerY - offsetY * zoom;
      
      if(mouseCanvasX >= drawX && mouseCanvasX <= drawX + scaledWidth &&
         mouseCanvasY >= drawY && mouseCanvasY <= drawY + scaledHeight){
        e.preventDefault();
        isDraggingOffset = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        dragStartOffsetX = offsetX;
        dragStartOffsetY = offsetY;
        canvas.style.cursor = 'move';
      }
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    if(isPanning){
      const dx = e.clientX - lastMouseX;
      const dy = e.clientY - lastMouseY;
      panX += dx;
      panY += dy;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      needsRender = true;
    } else if(isDraggingOffset){
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      const newOffsetX = Math.round(dragStartOffsetX - dx / zoom);
      const newOffsetY = Math.round(dragStartOffsetY - dy / zoom);
      setOffset(newOffsetX, newOffsetY, false);
    }
  });

  canvas.addEventListener('mouseup', (e) => {
    if(e.button === 1){
      isPanning = false;
      canvas.style.cursor = 'grab';
    } else if(e.button === 0 && isDraggingOffset){
      isDraggingOffset = false;
      canvas.style.cursor = viewOffset ? 'crosshair' : 'grab';
      
      if(offsetX !== dragStartOffsetX || offsetY !== dragStartOffsetY){
        vscode.postMessage({
          type: 'offset-changed',
          offsetX: offsetX,
          offsetY: offsetY
        });
        
        // Update UI dirty state without sending duplicate 'dirty' message
        if(!isDirty){
          isDirty = true;
          saveBtn.disabled = false;
          revertBtn.disabled = false;
        }
        
        //reset it bruh
        presetSelect.value = '';
      }
    }
  });

  canvas.addEventListener('mouseleave', () => {
    if(isPanning){
      isPanning = false;
      canvas.style.cursor = 'grab';
    }
    if(isDraggingOffset){
      isDraggingOffset = false;
      canvas.style.cursor = 'grab';
      
      if(offsetX !== dragStartOffsetX || offsetY !== dragStartOffsetY){
        vscode.postMessage({
          type: 'offset-changed',
          offsetX: offsetX,
          offsetY: offsetY
        });
    
        // Update UI dirty state without sending duplicate 'dirty' message
        if(!isDirty){
          isDirty = true;
          saveBtn.disabled = false;
          revertBtn.disabled = false;
        }
        
        presetSelect.value = '';
      }
    }
  });

  zoomInBtn.addEventListener('click', () => {
    setZoom(zoom * 1.2, canvas.width / 2, canvas.height / 2);
  });

  zoomOutBtn.addEventListener('click', () => {
    setZoom(zoom / 1.2, canvas.width / 2, canvas.height / 2);
  });

  fitBtn.addEventListener('click', () => {
    zoomToFit();
  });

  actualBtn.addEventListener('click', () => {
    panX = 0;
    panY = 0;
    setZoom(1);
  });

  recenterBtn.addEventListener('click', () => {
    recenterView();
  });

  viewOffsetCheckbox.addEventListener('change', (e) => {
    viewOffset = e.target.checked;
    canvas.style.cursor = viewOffset ? 'crosshair' : 'grab';
    needsRender = true;
  });

  offsetXInput.addEventListener('change', (e) => {
    const newValue = parseInt(e.target.value) || 0;
    setOffset(newValue, offsetY);
    presetSelect.value = ''; 
  });

  offsetYInput.addEventListener('change', (e) => {
    const newValue = parseInt(e.target.value) || 0;
    setOffset(offsetX, newValue);
    presetSelect.value = '';
  });

  presetSelect.addEventListener('change', (e) => {
    const presetValue = e.target.value;
    if(presetValue){
      applyPreset(presetValue);
    }
  });

  saveBtn.addEventListener('click', () => {
    if(isDirty && currentImageData){
      vscode.postMessage({
        type: 'save',
        dataUri: currentImageData,
        width: imgWidth,
        height: imgHeight
      });
    }
  });

  revertBtn.addEventListener('click', () => {
    if(isDirty){
      vscode.postMessage({type: 'revert'});
    }
  });

  flipHBtn.addEventListener('click', () => {
    applyTransform('flip-h');
  });

  flipVBtn.addEventListener('click', () => {
    applyTransform('flip-v');
  });

  rotateLeftBtn.addEventListener('click', () => {
    applyTransform('rotate-left');
  });

  rotateRightBtn.addEventListener('click', () => {
    applyTransform('rotate-right');
  });

  window.addEventListener('message', ev => {
    const msg = ev.data;
    if(msg.type === 'init-image'){
      imgData = msg.dataUri;
      currentImageData = msg.dataUri;
      imgWidth = msg.width;
      imgHeight = msg.height;
      offsetX = msg.offsetX || 0;
      offsetY = msg.offsetY || 0;
      
      if(msg.fileName && fileNameEl){
        fileNameEl.textContent = msg.fileName;
      }
      
      if(msg.customPresets){
        customPresets = msg.customPresets;
        updatePresetsDropdown();
      }
      
      image = new Image();
      image.onload = () => {
        resizeCanvas();
        zoomToFit();
        updateImageSize();
        updateOffsetInputs();
        setDirty(false);
      };
      image.src = imgData;
    } else if(msg.type === 'update-image'){
      currentImageData = msg.dataUri;
      imgWidth = msg.width;
      imgHeight = msg.height;
      offsetX = msg.offsetX !== undefined ? msg.offsetX : offsetX;
      offsetY = msg.offsetY !== undefined ? msg.offsetY : offsetY;
      canUndo = msg.canUndo;
      canRedo = msg.canRedo;
      
      //fix infinite duplication of undo state, make it dirty but dont send the message
      if(msg.isDirty !== undefined){
        isDirty = msg.isDirty;
        saveBtn.disabled = !msg.isDirty;
        revertBtn.disabled = !msg.isDirty;
      }
      
      image = new Image();
      image.onload = () => {
        needsRender = true;
        updateImageSize();
        updateOffsetInputs();
      };
      image.src = msg.dataUri;
    } else if(msg.type === 'saved'){
      setDirty(false);
    }
  });

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      vscode.postMessage({type: 'undo'});
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      e.stopPropagation();
      vscode.postMessage({type: 'redo'});
    }
  });

  window.addEventListener('resize', () => {
    resizeCanvas();
  });

  renderLoop();
  vscode.postMessage({type:'ready'});
})();