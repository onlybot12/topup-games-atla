const mongoose = require('mongoose');
const BannerSchema = new mongoose.Schema({
    image_url: String,
    title: String,
    target_link: String // Link ke game saat diklik
});
module.exports = mongoose.model('Banner', BannerSchema);
