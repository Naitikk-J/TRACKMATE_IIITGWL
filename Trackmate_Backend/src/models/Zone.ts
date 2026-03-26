import mongoose, { Schema } from 'mongoose';
import { IZone, ZoneRiskLevel } from '../types';

const zoneSchema = new Schema<IZone>(
    {
        name: { type: String, required: true, trim: true },
        description: { type: String },
        risk_level: { type: String, enum: Object.values(ZoneRiskLevel), required: true },
        center_lat: { type: Number, required: true },
        center_lng: { type: Number, required: true },
        radius_meters: { type: Number, required: true },
        geojson: { type: Schema.Types.Mixed },
        location: {
            type: { type: String, enum: ['Point'], default: 'Point' },
            coordinates: { type: [Number], required: true }, // [longitude, latitude]
        },
        managed_by: { type: Schema.Types.ObjectId, ref: 'Profile' },
        is_active: { type: Boolean, default: true },
        auto_alert: { type: Boolean, default: true },
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: false },
    }
);

// Pre-save hook to automatically maintain the location GeoJSON point
zoneSchema.pre('validate', function (next) {
    if (this.center_lat && this.center_lng) {
        this.location = {
            type: 'Point',
            coordinates: [this.center_lng, this.center_lat]
        };
    }
    next();
});

zoneSchema.index({ is_active: 1 });
zoneSchema.index({ risk_level: 1 });
zoneSchema.index({ location: '2dsphere' });

export const Zone = mongoose.model<IZone>('Zone', zoneSchema);
