import React, { useState, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

// Configure worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const PDFEditor = () => {
  // Debug: Verify this code version is loaded
  console.log("PDFEditor loaded - version 2025-12-28-v2");
  
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfPath, setPdfPath] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [scale, setScale] = useState(1.0);
  const [overlays, setOverlays] = useState([]);
  const [selectedOverlayId, setSelectedOverlayId] = useState(null);

  const fileInputRef = useRef(null);
  // Store the raw PDF bytes as a plain Array of numbers - immune to ArrayBuffer detachment
  const pdfBytesRef = useRef(null);

  // Clean up blob URL on unmount or change
  useEffect(() => {
    return () => {
      if (pdfFile) {
        URL.revokeObjectURL(pdfFile);
      }
    };
  }, [pdfFile]);

  // Load PDF
  const handleLoadPdf = async () => {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.openFile();
        if (result) {
          setPdfPath(result.filePath);
          const buffer = result.content instanceof ArrayBuffer ? result.content : result.content.buffer;
          const uint8Array = new Uint8Array(buffer);
          
          // Convert to plain Array of numbers
          const plainArray = Array.from(uint8Array);
          console.log("Loaded PDF as plain array, length:", plainArray.length);
          
          // Store in ref for saving
          pdfBytesRef.current = plainArray;
          
          // Create blob URL for viewer
          const viewerBytes = new Uint8Array(plainArray);
          const blob = new Blob([viewerBytes], { type: 'application/pdf' });
          setPdfFile(URL.createObjectURL(blob));
          setOverlays([]); // Reset overlays
        }
      } else {
        // Fallback to web file input
        fileInputRef.current.click();
      }
    } catch (e) {
      console.error("Error loading PDF:", e);
      alert("Error loading PDF: " + e.message);
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Use FileReader instead of file.arrayBuffer()
      const reader = new FileReader();
      reader.onload = (e) => {
        const arrayBuffer = e.target.result;
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // Convert to plain Array of numbers - completely immune to ArrayBuffer detachment
        const plainArray = Array.from(uint8Array);
        console.log("Loaded PDF as plain array, length:", plainArray.length);
        
        // Store plain array in ref for saving later
        pdfBytesRef.current = plainArray;
        
        // Create blob URL for the viewer (from a fresh Uint8Array)
        const viewerBytes = new Uint8Array(plainArray);
        const blob = new Blob([viewerBytes], { type: 'application/pdf' });
        setPdfFile(URL.createObjectURL(blob));
        setPdfPath(file.name);
        setOverlays([]);
      };
      reader.onerror = (e) => {
        console.error("Error reading file:", e);
        alert("Error reading file");
      };
      reader.readAsArrayBuffer(file);
    }
    // Reset input value so same file can be selected again
    event.target.value = null;
  };

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
  };

  const handlePageClick = (e, pageIndex) => {
    // Prevent adding overlay if clicking on an existing one
    if (e.target.closest('.text-overlay')) return;

    const pageRect = e.currentTarget.getBoundingClientRect();
    let x, y, text = 'New Text', isWhiteout = false;
    let fontSize = 12;

    // Check if clicked on a text span from the PDF text layer
    if (e.target.tagName === 'SPAN' && e.target.closest('.react-pdf__Page__textContent')) {
        const span = e.target;
        const spanRect = span.getBoundingClientRect();
        
        // Align exact position
        x = spanRect.left - pageRect.left;
        y = spanRect.top - pageRect.top; // Top-left of the text
        
        text = span.textContent;
        isWhiteout = true; // Auto-enable whiteout to "replace" text
        
        // Approximate font size
        const computedStyle = window.getComputedStyle(span);
        const renderedFontSize = parseFloat(computedStyle.fontSize);
        if (!isNaN(renderedFontSize)) {
            fontSize = renderedFontSize / scale;
        }
    } else {
        // Normal click on whitespace
        // Center the input on the click roughly
        x = e.clientX - pageRect.left;
        y = e.clientY - pageRect.top - (fontSize * scale / 2); 
        text = ''; // Start empty for new text boxes
    }

    const newOverlay = {
      id: Date.now(),
      pageIndex,
      x: x / scale,
      y: y / scale,
      text: text,
      fontSize: fontSize,
      isWhiteout: isWhiteout
    };

    setOverlays([...overlays, newOverlay]);
    setSelectedOverlayId(newOverlay.id);
  };

  const updateOverlay = (id, updates) => {
    setOverlays(overlays.map(o => o.id === id ? { ...o, ...updates } : o));
  };

  const deleteOverlay = (id) => {
    setOverlays(overlays.filter(o => o.id !== id));
  };

  // Helper function to generate the edited PDF bytes
  const generateEditedPdfBytes = async () => {
    if (!pdfBytesRef.current) {
      throw new Error('No PDF loaded');
    }

    // Convert plain array back to Uint8Array for pdf-lib
    const plainArray = pdfBytesRef.current;
    const pdfBytesInput = new Uint8Array(plainArray);

    const pdfDoc = await PDFDocument.load(pdfBytesInput);
    const pages = pdfDoc.getPages();
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    for (const overlay of overlays) {
      if (overlay.pageIndex >= pages.length) continue;
      const page = pages[overlay.pageIndex];
      const { height } = page.getSize();
      
      const pdfY = height - overlay.y - (overlay.fontSize * 0.8);

      if (overlay.isWhiteout) {
        const textWidth = helveticaFont.widthOfTextAtSize(overlay.text, overlay.fontSize);
        page.drawRectangle({
          x: overlay.x,
          y: pdfY - (overlay.fontSize * 0.2),
          width: textWidth + 4,
          height: overlay.fontSize + 4,
          color: rgb(1, 1, 1),
        });
      }

      page.drawText(overlay.text, {
        x: overlay.x,
        y: pdfY,
        size: overlay.fontSize,
        font: helveticaFont,
        color: rgb(0, 0, 0),
      });
    }

    return await pdfDoc.save();
  };

  // Preview - opens edited PDF in a new tab (user can download from there)
  const handlePreviewPdf = async () => {
    try {
      const pdfBytes = await generateEditedPdfBytes();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err) {
      console.error(err);
      alert('Failed to preview PDF: ' + err.message);
    }
  };

  const selectedOverlay = overlays.find(o => o.id === selectedOverlayId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <input 
        type="file" 
        ref={fileInputRef} 
        style={{ display: 'none' }} 
        accept="application/pdf"
        onChange={handleFileChange}
      />
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', position: 'sticky', top: 0, background: '#fff', zIndex: 100, padding: '10px', borderBottom: '1px solid #ccc', flexWrap: 'wrap' }}>
        <button onClick={handleLoadPdf}>Open PDF</button>
        <button onClick={handlePreviewPdf} disabled={!pdfFile}>Preview</button>
        
        {selectedOverlay && (
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginLeft: 'auto', borderLeft: '2px solid #ddd', paddingLeft: '15px' }}>
             <span style={{fontSize: '14px', fontWeight: 'bold'}}>Text Settings:</span>
             <label style={{fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px'}}>
               <input 
                 type="checkbox" 
                 checked={selectedOverlay.isWhiteout} 
                 onChange={(e) => updateOverlay(selectedOverlay.id, { isWhiteout: e.target.checked })} 
               /> 
               Cover Text
             </label>
             <div style={{display: 'flex', alignItems: 'center', gap: '5px'}}>
               <span style={{fontSize: '14px'}}>Size:</span>
               <input 
                 type="number" 
                 value={selectedOverlay.fontSize} 
                 onChange={(e) => updateOverlay(selectedOverlay.id, { fontSize: Number(e.target.value) })} 
                 style={{width: '50px', padding: '4px', borderRadius: '4px', border: '1px solid #ccc'}} 
               />
             </div>
             <button 
               onClick={() => deleteOverlay(selectedOverlay.id)}
               style={{backgroundColor: '#dc3545', padding: '6px 12px', fontSize: '13px'}}
             >
               Delete Text
             </button>
          </div>
        )}
      </div>

      <div className="editor-container" style={{ background: '#eee', padding: '20px', minHeight: '80vh' }}>
        {!pdfFile && <div style={{textAlign: 'center', marginTop: '50px'}}>Open a PDF to start editing</div>}
        
        {pdfFile && (
          <Document
            file={pdfFile}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={(error) => console.error('Error loading PDF:', error)}
          >
            {Array.from(new Array(numPages), (el, index) => (
              <div 
                key={`page_${index + 1}`} 
                style={{ position: 'relative', marginBottom: '20px', display: 'flex', justifyContent: 'center' }}
              >
                <div 
                  style={{ position: 'relative', cursor: 'text' }}
                  onClick={(e) => handlePageClick(e, index)}
                >
                  <Page 
                    pageNumber={index + 1} 
                    scale={scale}
                    renderTextLayer={true} // Enable text layer for interaction
                    renderAnnotationLayer={false}
                  />
                  
                  {/* Overlays for this page */}
                  {overlays.filter(o => o.pageIndex === index).map(overlay => (
                    <div
                      key={overlay.id}
                      className="text-overlay"
                      style={{
                        position: 'absolute',
                        left: overlay.x * scale,
                        top: overlay.y * scale,
                        // Removed transform to ensure better alignment with existing text
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div style={{position: 'relative', display: 'flex', alignItems: 'center'}}>
                        <input
                          type="text"
                          value={overlay.text}
                          onChange={(e) => updateOverlay(overlay.id, { text: e.target.value })}
                          style={{
                            fontSize: `${overlay.fontSize * scale}px`,
                            border: selectedOverlayId === overlay.id ? '1px solid blue' : '1px dashed transparent',
                            background: overlay.isWhiteout ? 'white' : 'transparent',
                            color: 'black',
                            outline: 'none',
                            padding: '2px',
                            fontFamily: 'Helvetica, sans-serif',
                            minWidth: '20px'
                          }}
                          onFocus={(e) => {
                            setSelectedOverlayId(overlay.id);
                          }}
                          onBlur={() => {
                            if (!overlay.text.trim()) {
                                deleteOverlay(overlay.id);
                            }
                            // Don't clear selectedOverlayId immediately to allow clicking the delete button
                            // setSelectedOverlayId(null); 
                          }}
                          autoFocus
                          placeholder="Type text..."
                          onKeyDown={(e) => {
                             if (e.key === 'Backspace' && overlay.text === '') {
                                 deleteOverlay(overlay.id);
                             }
                          }}
                        />
                        {selectedOverlayId === overlay.id && (
                             <button 
                                onClick={() => deleteOverlay(overlay.id)}
                                style={{
                                    marginLeft: '5px',
                                    background: 'red',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '16px',
                                    height: '16px',
                                    fontSize: '10px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    padding: 0
                                }}
                                title="Delete"
                             >
                                x
                             </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </Document>
        )}
      </div>
    </div>
  );
};

export default PDFEditor;

