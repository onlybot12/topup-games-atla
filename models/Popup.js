const mongoose = require('mongoose');

const PopupSchema = new mongoose.Schema({
    image_url: { type: String, required: true },
    description: { type: String }, // Teks di bawah gambar
    target_link: { type: String },  // Link tujuan (WhatsApp/Saluran)
    is_active: { type: Boolean, default: true },
    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Popup', PopupSchema);
