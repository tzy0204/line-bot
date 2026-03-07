const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
    },
    task: {
        type: String,
        required: true,
    },
    triggerTime: {
        type: Date,
        required: true,
    },
    isNotified: {
        type: Boolean,
        default: false,
    }
}, { timestamps: true });

module.exports = mongoose.model('Reminder', reminderSchema);
