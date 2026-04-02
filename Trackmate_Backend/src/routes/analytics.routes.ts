import express, { Router, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { Incident, Profile, LocationLog, Zone } from '../models';
import { AuthRequest, UserRole } from '../types';

const router: Router = express.Router();

// ─── Incident trend (last 30 days, by type) ───────────────────────────

router.get(
    '/incidents',
    authenticate,
    requireRole(UserRole.AUTHORITY, UserRole.ADMIN),
    async (req: AuthRequest, res: Response, next) => {
        try {
            const { from, to, zone, ward } = req.query;
            const start = from ? new Date(String(from)) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const end = to ? new Date(String(to)) : new Date();

            const match: Record<string, any> = { created_at: { $gte: start, $lte: end } };
            if (zone) match.zone = zone;
            if (ward) match.ward = ward;

            const [byDay, byType, byZone, bySeverity, lifecycle] = await Promise.all([
                Incident.aggregate([
                    { $match: match },
                    {
                        $group: {
                            _id: {
                                date: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } },
                                type: '$incident_type',
                            },
                            count: { $sum: 1 },
                        },
                    },
                    { $sort: { '_id.date': 1 } },
                ]),
                Incident.aggregate([
                    { $match: match },
                    { $group: { _id: '$incident_type', count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                ]),
                Incident.aggregate([
                    { $match: match },
                    { $group: { _id: '$zone', count: { $sum: 1 } } },
                    { $lookup: { from: 'zones', localField: '_id', foreignField: '_id', as: 'zone' } },
                    { $unwind: { path: '$zone', preserveNullAndEmptyArrays: true } },
                    { $project: { name: { $ifNull: ['$zone.name', 'Unzoned'] }, count: 1 } },
                ]),
                Incident.aggregate([
                    { $match: match },
                    { $group: { _id: '$severity', count: { $sum: 1 } } },
                ]),
                Incident.aggregate([
                    { $match: match },
                    { $group: { _id: '$status', count: { $sum: 1 } } },
                ]),
            ]);

            res.json({
                success: true,
                data: { byDay, byType, byZone, bySeverity, lifecycle },
            });
        } catch (err) {
            next(err);
        }
    }
);

// ─── Tourist activity (daily active count last 30 days) ───────────────

router.get(
    '/tourists',
    authenticate,
    requireRole(UserRole.AUTHORITY, UserRole.ADMIN),
    async (_req: AuthRequest, res: Response, next) => {
        try {
            const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const daily = await LocationLog.aggregate([
                { $match: { recorded_at: { $gte: cutoff } } },
                {
                    $lookup: {
                        from: 'profiles',
                        localField: 'user',
                        foreignField: '_id',
                        as: 'profile',
                    },
                },
                { $unwind: '$profile' },
                { $match: { 'profile.role': 'tourist' } },
                {
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m-%d', date: '$recorded_at' } },
                        count: { $addToSet: '$user' },
                    },
                },
                { $project: { date: '$_id', count: { $size: '$count' }, _id: 0 } },
                { $sort: { date: 1 } },
            ]);

            const totalTourists = await Profile.countDocuments({ role: 'tourist', is_active: true });
            const activeTourists = await LocationLog.distinct('user', {
                recorded_at: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            });

            res.json({
                success: true,
                data: { daily, totalTourists, activeTodayCount: activeTourists.length },
            });
        } catch (err) {
            next(err);
        }
    }
);

// ─── Zone safety scores over time ────────────────────────────────────

router.get(
    '/zones',
    authenticate,
    requireRole(UserRole.AUTHORITY, UserRole.ADMIN),
    async (_req: AuthRequest, res: Response, next) => {
        try {
            const zones = await Zone.find({ is_active: true }).lean();
            const zoneStats = await Promise.all(
                zones.map(async (z) => {
                    const activeIncidents = await Incident.countDocuments({
                        zone: z._id,
                        status: { $in: ['active', 'acknowledged', 'assigned'] },
                    });
                    const resolvedLast7d = await Incident.countDocuments({
                        zone: z._id,
                        status: 'resolved',
                        resolved_at: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
                    });
                    return {
                        id: z._id,
                        name: z.name,
                        risk_level: z.risk_level,
                        active_incidents: activeIncidents,
                        resolved_last_7d: resolvedLast7d,
                    };
                })
            );

            res.json({ success: true, data: zoneStats });
        } catch (err) {
            next(err);
        }
    }
);

// ─── Platform stats summary ───────────────────────────────────────────

router.get(
    '/summary',
    authenticate,
    requireRole(UserRole.AUTHORITY, UserRole.ADMIN),
    async (_req: AuthRequest, res: Response, next) => {
        try {
            const now = new Date();
            const todayStart = new Date(now.setHours(0, 0, 0, 0));
            const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

            const [totalUsers, openIncidents, sosLastHour, activeTodayUsers] = await Promise.all([
                Profile.countDocuments({ is_active: true }),
                Incident.countDocuments({ status: { $in: ['active', 'acknowledged', 'assigned'] } }),
                Incident.countDocuments({ source: 'sos_panic', created_at: { $gte: hourAgo } }),
                LocationLog.distinct('user', { recorded_at: { $gte: todayStart } }),
            ]);

            res.json({
                success: true,
                data: {
                    totalUsers,
                    openIncidents,
                    sosLastHour,
                    activeUsersToday: activeTodayUsers.length,
                },
            });
        } catch (err) {
            next(err);
        }
    }
);

<<<<<<< HEAD
// ─── AI Predictive Risk Modeling (Mock for Hackathon) ───────────────────

router.get(
    '/predictive',
    authenticate,
    requireRole(UserRole.AUTHORITY, UserRole.ADMIN),
    async (_req: AuthRequest, res: Response, next) => {
        try {
            // In a real scenario, this would call an ML model endpoint (e.g., Python/Flask)
            // returning clustered risk coordinates based on historical incident density.
            // For the hackathon, we'll generate high-probability risk coordinates near existing 'high' risk zones.
            
            const highRiskZones = await Zone.find({ is_active: true, risk_level: { $in: ['high', 'restricted'] } }).lean();
            
            const predictions = highRiskZones.map(zone => {
                // Generate a slightly offset coordinate to simulate a "growing" or "shifting" risk area
                const latOffset = (Math.random() - 0.5) * 0.01;
                const lngOffset = (Math.random() - 0.5) * 0.01;
                return {
                    id: `pred_${zone._id}`,
                    reason: `High concentration of recent anomalies near ${zone.name}`,
                    confidence: Math.floor(Math.random() * 25) + 70, // 70 to 95%
                    latitude: zone.center_lat + latOffset,
                    longitude: zone.center_lng + lngOffset,
                    radius_meters: Math.floor(Math.random() * 300) + 200, // 200-500m
                };
            });

            // Add one random generic prediction for demo purposes
            predictions.push({
                id: `pred_random_${Math.random()}`,
                reason: `AI detected unusual nighttime movement patterns`,
                confidence: 88,
                latitude: 27.5890,
                longitude: 91.8680,
                radius_meters: 450,
            });

            res.json({
                success: true,
                data: predictions,
            });
        } catch (err) {
            next(err);
        }
    }
);

// ─── Ward-specific analytics summary ─────────────────────────────────

router.get(
    '/ward/:id',
    authenticate,
    async (req: AuthRequest, res: Response, next) => {
        try {
            const wardId = req.params.id;
            const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

            // If wardId is 'general', we can return some global or default stats
            if (wardId === 'general') {
                const totalResidents = await Profile.countDocuments({ role: UserRole.RESIDENT, is_active: true });
                const activeTourists = await LocationLog.distinct('user', { recorded_at: { $gte: hourAgo } });
                
                return res.json({
                    success: true,
                    data: {
                        safety_score: 95,
                        resident_count: totalResidents,
                        tourist_count: activeTourists.length,
                    }
                });
            }

            const [residentCount, activeTourists, activeIncidents] = await Promise.all([
                Profile.countDocuments({ ward: wardId, role: UserRole.RESIDENT, is_active: true }),
                LocationLog.distinct('user', { current_ward: wardId, recorded_at: { $gte: hourAgo } }),
                Incident.countDocuments({ ward: wardId, status: { $in: ['active', 'acknowledged', 'assigned'] } }),
            ]);

            // Simple safety score formula: starts at 100, drops per active incident
            const safety_score = Math.max(0, 100 - activeIncidents * 10);
=======
// ─── Ward summary analytics ──────────────────────────────────────────

router.get(
    '/ward/:wardId',
    authenticate,
    async (req: AuthRequest, res: Response, next) => {
        try {
            const { wardId } = req.params;
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            const [openIncidents, totalIncidents, touristCount, residentCount, activeUsersToday] = await Promise.all([
                Incident.countDocuments({ ward: wardId, status: { $in: ['active', 'acknowledged', 'assigned', 'escalated'] } }),
                Incident.countDocuments({ ward: wardId }),
                Profile.countDocuments({ ward: wardId, role: 'tourist', is_active: true }),
                Profile.countDocuments({ ward: wardId, role: 'resident', is_active: true }),
                LocationLog.distinct('user', { recorded_at: { $gte: todayStart } }),
            ]);

            const baseScore = 100;
            const penalty = Math.min(openIncidents * 8, 60);
            const safetyScore = Math.max(0, baseScore - penalty);
>>>>>>> 59af571c75f3940ab7df0ced3c23f6ffde591a54

            res.json({
                success: true,
                data: {
<<<<<<< HEAD
                    safety_score,
                    resident_count: residentCount,
                    tourist_count: activeTourists.length,
=======
                    wardId,
                    open_incidents: openIncidents,
                    total_incidents: totalIncidents,
                    tourist_count: touristCount,
                    resident_count: residentCount,
                    active_users_today: activeUsersToday.length,
                    safety_score: safetyScore,
>>>>>>> 59af571c75f3940ab7df0ced3c23f6ffde591a54
                },
            });
        } catch (err) {
            next(err);
        }
    }
);

export default router;
