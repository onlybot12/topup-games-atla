const mongoose = require('mongoose');

const CategoryProfitSchema = new mongoose.Schema({
    category_name: { type: String, unique: true, required: true }, 
    type: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' }, 
    value: { type: Number, default: 0 }
});

module.exports = mongoose.model('CategoryProfit', CategoryProfitSchema);
