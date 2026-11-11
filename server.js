const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'bd_intercambio.json');
const CSV_FILE = path.join(__dirname, 'bd_intercambio_pijamas.csv');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function updateCSVSnapshot(data) {
  if (!data || !Array.isArray(data.participantes)) return;
  const headers = ['Nombre', 'Token', 'Talla', 'Color_Estampado', 'Contacto', 'Regala_A', 'Talla_Asignado', 'Gusto_Asignado'];
  const rows = data.participantes.map(p => [
    `"${(p.nombre || '').replace(/"/g, '""')}"`,
    `"${p.token || ''}"`,
    `"${(p.talla || '').replace(/"/g, '""')}"`,
    `"${(p.color_estampado || '').replace(/"/g, '""')}"`,
    `"${(p.contacto || '').replace(/"/g, '""')}"`,
    `"${(p.asignado_nombre || '').replace(/"/g, '""')}"`,
    `"${(p.asignado_talla || '').replace(/"/g, '""')}"`,
    `"${(p.asignado_color_estampado || '').replace(/"/g, '""')}"`
  ]);
  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  fs.writeFileSync(CSV_FILE, csvContent, 'utf8');
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = req.url.split('?')[0];

  // Endpoint API para leer y guardar la Base de Datos en tiempo real
  if (parsedUrl === '/api/db') {
    if (req.method === 'GET') {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(raw);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No se pudo leer bd_intercambio.json' }));
      }
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          fs.writeFileSync(DB_FILE, JSON.stringify(parsed, null, 2), 'utf8');
          updateCSVSnapshot(parsed);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, total: (parsed.participantes || []).length }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'JSON inválido' }));
        }
      });
      return;
    }
  }

  // Servir archivos estáticos del sitio móvil
  let safePath = parsedUrl === '/' ? '/index.html' : parsedUrl;
  const filePath = path.join(__dirname, path.normalize(safePath));

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Acceso denegado');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Archivo no encontrado');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`🎄 Servidor del Intercambio de Pijamas activo en: http://localhost:${PORT}`);
  console.log(`📂 Base de datos guardándose en: ${DB_FILE}`);
});
