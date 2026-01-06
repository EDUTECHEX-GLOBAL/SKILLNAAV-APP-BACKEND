const express = require('express');
const router = express.Router();
const Feedback = require('../../models/webapp-models/Feedback');
const mongoose = require('mongoose');

router.get('/summary', async (req, res) => {
  try {
    const flow = req.query.flow && req.query.flow !== 'all' ? req.query.flow : null;
    const timeRange = req.query.timeRange || '30d';
    
    // Calculate date range
    const now = new Date();
    let startDate = new Date();
    
    switch(timeRange) {
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default: // 30d
        startDate.setDate(now.getDate() - 30);
    }

    const match = { createdAt: { $gte: startDate } };
    if (flow) match.flow = flow;

    // Enhanced flow analytics
    const flowAnalytics = await Feedback.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$flow',
          count: { $sum: 1 },
          avgOverall: { $avg: { $toDouble: "$answers.overall" } },
          avgNps: { $avg: { $toDouble: "$answers.nps" } },
          sentimentScore: {
            $avg: {
              $cond: [
                { $gte: [{ $toDouble: "$answers.overall" }, 4] },
                100,
                { $cond: [
                  { $gte: [{ $toDouble: "$answers.overall" }, 3] },
                  50,
                  0
                ]}
              ]
            }
          }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Get issues by flow with better categorization
    const issuesByFlow = {};
    const flows = flow ? [flow] : ['student', 'partner', 'schoolAdmin'];
    
    for (const flowType of flows) {
      const flowMatch = { ...match, flow: flowType };
      
      const flowIssues = await Feedback.aggregate([
        { $match: flowMatch },
        {
          $project: {
            issueText: {
              $ifNull: [
                "$answers.issueDesc",
                "$answers.issueDesc_partner",
                "$answers.confusing",
                "$answers.suggestions"
              ]
            },
            rating: { $toDouble: "$answers.overall" },
            createdAt: 1
          }
        },
        { $match: { issueText: { $ne: null, $ne: "" } } },
        {
          $group: {
            _id: "$issueText",
            count: { $sum: 1 },
            avgRating: { $avg: "$rating" },
            lastReported: { $max: "$createdAt" },
            flow: { $first: flowType }
          }
        },
        {
          $project: {
            text: "$_id",
            count: 1,
            avgRating: { $round: ["$avgRating", 1] },
            lastReported: 1,
            sentiment: {
              $cond: [
                { $lt: ["$avgRating", 2.5] },
                "negative",
                { $cond: [
                  { $lt: ["$avgRating", 3.5] },
                  "neutral",
                  "positive"
                ]}
              ]
            },
            priority: {
              $cond: [
                { $and: [
                  { $lt: ["$avgRating", 2] },
                  { $gt: ["$count", 5] }
                ]},
                "high",
                { $cond: [
                  { $lt: ["$avgRating", 3] },
                  "medium",
                  "low"
                ]}
              ]
            }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]);

      if (flowIssues.length > 0) {
        issuesByFlow[flowType] = flowIssues;
      }
    }

    // Get feature requests by flow
    const featureRequests = await Feedback.aggregate([
      { $match: match },
      {
        $project: {
          feature: {
            $ifNull: [
              "$answers.featureUsed",
              "$answers.toolsUsed",
              "$answers.missingFeature"
            ]
          },
          flow: 1
        }
      },
      { $match: { feature: { $ne: null, $ne: "" } } },
      {
        $group: {
          _id: "$feature",
          count: { $sum: 1 },
          byFlow: {
            $push: {
              flow: "$flow",
              count: 1
            }
          }
        }
      },
      {
        $addFields: {
          byFlow: {
            $reduce: {
              input: "$byFlow",
              initialValue: { student: 0, partner: 0, schoolAdmin: 0 },
              in: {
                student: { $add: ["$$value.student", { $cond: [{ $eq: ["$$this.flow", "student"] }, 1, 0] }] },
                partner: { $add: ["$$value.partner", { $cond: [{ $eq: ["$$this.flow", "partner"] }, 1, 0] }] },
                schoolAdmin: { $add: ["$$value.schoolAdmin", { $cond: [{ $eq: ["$$this.flow", "schoolAdmin"] }, 1, 0] }] }
              }
            }
          }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
      {
        $project: {
          feature: "$_id",
          count: 1,
          byFlow: 1,
          _id: 0
        }
      }
    ]);

    // Get rating distribution
    const ratingDistribution = await Feedback.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $floor: { $toDouble: "$answers.overall" } },
          count: { $sum: 1 }
        }
      },
      { $match: { _id: { $gte: 1, $lte: 5 } } },
      { $sort: { _id: 1 } }
    ]);

    // Format rating counts array
    const ratingCounts = Array(5).fill(0);
    ratingDistribution.forEach(r => {
      ratingCounts[r._id - 1] = r.count;
    });

    // Get trend data
    const trendData = await Feedback.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            flow: "$flow"
          },
          count: { $sum: 1 },
          avgRating: { $avg: { $toDouble: "$answers.overall" } }
        }
      },
      { $sort: { "_id.date": 1 } },
      {
        $group: {
          _id: "$_id.date",
          total: { $sum: "$count" },
          byFlow: {
            $push: {
              flow: "$_id.flow",
              count: "$count"
            }
          }
        }
      },
      { $sort: { "_id": 1 } },
      { $limit: 14 }
    ]);

    // Calculate overall averages
    const overallStats = await Feedback.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          avgOverall: { $avg: { $toDouble: "$answers.overall" } },
          avgNps: { $avg: { $toDouble: "$answers.nps" } }
        }
      }
    ]);

    const stats = overallStats[0] || { total: 0, avgOverall: null, avgNps: null };

    res.json({
      ok: true,
      total: stats.total,
      byFlow: flowAnalytics,
      avgOverall: stats.avgOverall ? Number(stats.avgOverall.toFixed(2)) : null,
      avgNps: stats.avgNps ? Number(stats.avgNps.toFixed(2)) : null,
      issuesByFlow,
      topFeatures: featureRequests,
      ratingCounts,
      trend: trendData,
      sentimentByFlow: flowAnalytics.map(f => ({
        _id: f._id,
        sentimentScore: f.sentimentScore ? Math.round(f.sentimentScore) : 0
      })),
      summary: {
        timeRange,
        flowsAnalyzed: flows.length,
        totalIssues: Object.values(issuesByFlow).flat().length,
        avgResponseTime: "24h", // You can calculate this from your data
        satisfactionRate: Math.round((stats.avgOverall / 5) * 100)
      }
    });

  } catch (err) {
    console.error('Summary error:', err);
    res.status(500).json({ ok: false, message: 'Failed to generate summary', error: err.message });
  }
});

module.exports = router;