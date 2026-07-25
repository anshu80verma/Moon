const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const UPLOAD_DIR = path.join(__dirname, 'Uploads');
const DATA_FILE = path.join(__dirname, 'entries.json');

// Make sure the Uploads folder and the data file exist
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');

function readEntries() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
    return [];
  }
}

function writeEntries(entries) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2));
}

// Where multer physically writes the uploaded file: the "Uploads" folder
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const id = 'e' + Date.now() + Math.random().toString(36).slice(2, 8);
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    req._generatedId = id;
    cb(null, id + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per photo
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  }
});

app.use(cors());
app.use(express.json());

// Serve the uploaded photos directly from the Uploads folder
app.use('/uploads', express.static(UPLOAD_DIR));

// Serve the frontend
app.use(express.static(path.join(__dirname, 'public')));

// List all entries (newest first)
app.get('/api/entries', (req, res) => {
  const entries = readEntries().sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json(entries);
});

// Upload a new photo -> written to /Uploads on disk
app.post('/api/entries', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const entry = {
    id: path.parse(req.file.filename).name,
    filename: req.file.filename,
    url: '/uploads/' + req.file.filename,
    caption: '',
    date: new Date().toISOString()
  };

  const entries = readEntries();
  entries.unshift(entry);
  writeEntries(entries);

  res.json(entry);
});

// Update a caption
app.put('/api/entries/:id', (req, res) => {
  const entries = readEntries();
  const entry = entries.find(e => e.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Not found' });

  if (typeof req.body.caption === 'string') {
    entry.caption = req.body.caption;
  }
  writeEntries(entries);
  res.json(entry);
});

// Delete a photo (removes the file from Uploads and the entry)
app.delete('/api/entries/:id', (req, res) => {
  let entries = readEntries();
  const entry = entries.find(e => e.id === req.params.id);

  if (entry) {
    const filePath = path.join(UPLOAD_DIR, entry.filename);
    fs.unlink(filePath, () => {}); // ignore errors if file is already gone
  }

  entries = entries.filter(e => e.id !== req.params.id);
  writeEntries(entries);
  res.json({ success: true });
});

// Friendly error handler for multer errors (e.g. file too large)
app.use((err, req, res, next) => {
  if (err) {
    return res.status(400).json({ error: err.message || 'Upload failed' });
  }
  next();
});

app.listen(PORT, () => {
  console.log(`The Wall server running at http://localhost:${PORT}`);
  console.log(`Photos are being saved to: ${UPLOAD_DIR}`);
});
