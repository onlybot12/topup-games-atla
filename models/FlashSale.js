const FlashSaleSchema = new mongoose.Schema({
    item_name: String,
    service_id: String,
    original_price: Number,
    promo_price: Number,
    end_date: Date, // Untuk hitung mundur (countdown)
    is_active: { type: Boolean, default: true }
});
module.exports = mongoose.model('FlashSale', FlashSaleSchema);
