const multer = require('multer');
const fs = require('fs');
const path = require('path');

function createDiskUpload({ destination, filename, limits, fileFilter }) {
  const storage = multer.diskStorage({
    destination(req, file, cb) {
      cb(null, destination);
    },
    filename(req, file, cb) {
      cb(null, filename(file));
    },
  });

  return multer({ storage, limits, fileFilter });
}

const memoryUpload = multer();

const profileUploadDirectory = path.join(__dirname, '../../public/uploads/profile');
fs.mkdirSync(profileUploadDirectory, { recursive: true });

const profileImageUpload = createDiskUpload({
  destination: profileUploadDirectory,
  filename(file) {
    const extensions = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
    const extension = extensions[file.mimetype] || '.jpg';
    return `avatar-${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;
  },
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype));
  },
}).single('avatar');

function uploadProfileImage(req, res, next) {
  profileImageUpload(req, res, (error) => {
    if (error) {
      error.statusCode = 400;
      return next(error);
    }
    if (!req.file) return res.status(400).send('請選擇 JPG、PNG 或 WEBP 圖片');
    next();
  });
}

module.exports = {
  memoryUpload,
  uploadProfileImage,
};
