const mongoose = require('mongoose');

const ConfigSchema = new mongoose.Schema({
    key: { type: String, unique: true }, // Contoh: 'qris_settings'
    admin_fee: { type: Number, default: 700 }, // Biaya Rp (Contoh: 700)
    tax_percent: { type: Number, default: 1.4 } // Biaya % MDR (Contoh: 1.4)
});

module.exports = mongoose.model('Config', ConfigSchema);
