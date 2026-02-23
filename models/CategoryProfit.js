const mongoose = require('mongoose');

const CategoryProfitSchema = new mongoose.Schema({
    category_name: { type: String, unique: true, required: true }, // Nama kategori dari Atlantic
    type: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' }, // Persen atau Rupiah
    value: { type: Number, default: 0 } // Angkanya
});

module.exports = mongoose.model('CategoryProfit', CategoryProfitSchema);
