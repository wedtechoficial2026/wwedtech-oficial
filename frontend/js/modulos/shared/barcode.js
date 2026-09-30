// Desenha um código de barras EAN-13 em SVG (sem dependências).
// Serve para imprimir/mostrar a etiqueta do produto e bipar com a câmera do celular.
(function (global) {
  "use strict";
  const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
  const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
  const R = L.map((c) => c.replace(/./g, (b) => (b === "0" ? "1" : "0")));
  const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

  function ean13Bits(code) {
    const d = String(code).split("").map(Number);
    const parity = PARITY[d[0]];
    let bits = "101";
    for (let i = 1; i <= 6; i++) bits += (parity[i - 1] === "L" ? L : G)[d[i]];
    bits += "01010";
    for (let i = 7; i <= 12; i++) bits += R[d[i]];
    return bits + "101";
  }

  function toSVG(code, width = 220, height = 80) {
    if (!/^\d{13}$/.test(String(code))) return "";
    const bits = ean13Bits(code);
    const quiet = 9;
    const total = bits.length + quiet * 2;
    let rects = "";
    for (let i = 0; i < bits.length; i++)
      if (bits[i] === "1") rects += '<rect x="' + (i + quiet) + '" y="0" width="1" height="' + (height - 16) + '"/>';
    return (
      '<svg class="barcode" viewBox="0 0 ' + total + " " + height + '" width="' + width + '" height="' + height +
      '" role="img" aria-label="Código de barras ' + code + '" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">' +
      rects + '</g><text x="' + total / 2 + '" y="' + (height - 3) + '" text-anchor="middle" font-size="11" font-family="monospace" fill="#000">' + code + "</text></svg>"
    );
  }

  const api = { toSVG };
  if (typeof module !== "undefined") module.exports = api;
  global.WedTechBarcode = api;
})(typeof window !== "undefined" ? window : globalThis);
