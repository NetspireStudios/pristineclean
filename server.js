const http = require('http');
const fs = require('fs');
const path = require('path');

const port = 8000;

// Map SEO-friendly routes to the actual static files
const seoRoutes = {
    '/services/standard-cleaning': './pages/services/standard-cleaning.html',
    '/services/move-in-out-cleaning': './pages/services/move-in-out-cleaning.html',
    '/services/carpet-cleaning': './pages/services/carpet-cleaning.html',
    '/services/deep-cleaning': './pages/services/deep-cleaning.html',
    '/services/house-cleaning': './pages/services/house-cleaning.html',
    '/services/kitchen-cleaning': './pages/services/kitchen-cleaning.html',
    '/services/office-cleaning': './pages/services/office-cleaning.html',
    '/services/post-construction': './pages/services/post-construction.html',
    '/services/vacation-rental-cleaning': './pages/services/vacation-rental-cleaning.html'
};

const server = http.createServer((req, res) => {
    // Strip query strings and trailing slashes for matching
    const requestPath = req.url.split('?')[0];
    const normalizedPath = requestPath !== '/' && requestPath.endsWith('/')
        ? requestPath.slice(0, -1)
        : requestPath;

    // Parse URL
    let filePath = '.' + normalizedPath;
    if (filePath === './') {
        filePath = './index.html';
    }

    if (seoRoutes[normalizedPath]) {
        filePath = seoRoutes[normalizedPath];
    }

    // Get file extension
    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.wav': 'audio/wav',
        '.mp4': 'video/mp4',
        '.woff': 'application/font-woff',
        '.ttf': 'application/font-ttf',
        '.eot': 'application/vnd.ms-fontobject',
        '.otf': 'application/font-otf',
        '.wasm': 'application/wasm'
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                // Page not found
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 - Page Not Found</h1>', 'utf-8');
            } else {
                // Server error
                res.writeHead(500);
                res.end(`Server Error: ${error.code}`);
            }
        } else {
            // Success
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}/`);
    console.log('📁 Serving files from current directory');
    console.log('⏹️  Press Ctrl+C to stop the server');
});