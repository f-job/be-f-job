import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserRole } from '../users/schemas/user.schema';
import { Job, JobStatus } from '../jobs/schemas/job.schema';
import { CandidateProfile } from '../candidates/schemas/candidate-profile.schema';

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Job.name) private readonly jobModel: Model<Job>,
    @InjectModel(CandidateProfile.name) private readonly candidateModel: Model<CandidateProfile>,
  ) {}

  async getStats() {
    const [
      totalUsers,
      totalEmployers,
      totalJobs,
      activeJobs,
      pendingVerifications,
      jobsByIndustry,
      recentUsers,
      recentJobs,
    ] = await Promise.all([
      // Total candidates
      this.userModel.countDocuments({ role: UserRole.CANDIDATE }),
      
      // Total employers
      this.userModel.countDocuments({ role: UserRole.EMPLOYER }),
      
      // Total jobs
      this.jobModel.countDocuments(),
      
      // Active jobs
      this.jobModel.countDocuments({ status: JobStatus.ACTIVE }),
      
      // Pending verifications (heuristic: users created but not verified, or similar depending on actual schema)
      // For now, just count users that require identity verification
      this.userModel.countDocuments({ identityVerificationRequired: true, role: { $in: [UserRole.CANDIDATE, UserRole.EMPLOYER] } }),
      
      // Jobs by Industry (aggregation for the BarChart)
      this.jobModel.aggregate([
        {
          $group: {
            _id: '$industry',
            active: {
              $sum: { $cond: [{ $eq: ['$status', JobStatus.ACTIVE] }, 1, 0] },
            },
            pending: {
              $sum: { $cond: [{ $eq: ['$status', JobStatus.PENDING] }, 1, 0] },
            },
            total: { $sum: 1 },
          },
        },
        { $sort: { total: -1 } },
        { $limit: 5 },
        {
          $project: {
            name: '$_id',
            active: 1,
            pending: 1,
            _id: 0,
          },
        },
      ]),

      // Recent Users (for activity table)
      this.userModel.find({ role: { $in: [UserRole.CANDIDATE, UserRole.EMPLOYER] } })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('email role createdAt'),

      // Recent Jobs (for activity table)
      this.jobModel.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select('title companyName createdAt'),
    ]);

    // Mocking User Growth Data (AreaChart) by months since complex date aggregation is verbose
    // In a real scenario, this would group by month of createdAt
    // We will do a basic monthly aggregation for the last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const userGrowthRaw = await this.userModel.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            role: '$role'
          },
          count: { $sum: 1 }
        }
      }
    ]);

    // Format the growth data for Recharts
    const growthMap = new Map<string, { name: string; users: number; employers: number; sortKey: string }>();
    
    // Initialize last 6 months
    for (let i = 0; i < 6; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const m = d.getMonth() + 1;
      const y = d.getFullYear();
      const key = `${y}-${m}`;
      growthMap.set(key, { 
        name: `T${m}/${y.toString().slice(-2)}`, 
        users: 0, 
        employers: 0,
        sortKey: key 
      });
    }

    userGrowthRaw.forEach(item => {
      const key = `${item._id.year}-${item._id.month}`;
      const entry = growthMap.get(key);
      if (entry) {
        if (item._id.role === UserRole.CANDIDATE) {
          entry.users += item.count;
        } else if (item._id.role === UserRole.EMPLOYER) {
          entry.employers += item.count;
        }
      }
    });

    const userGrowthData = Array.from(growthMap.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    // Format recent activities
    const recentActivities = [];
    let idCounter = 1;

    recentUsers.forEach(u => {
      recentActivities.push({
        id: idCounter++,
        action: u.role === UserRole.EMPLOYER ? 'Nhà tuyển dụng mới' : 'Ứng viên mới đăng ký',
        target: u.email,
        time: (u as any).createdAt,
        type: 'user',
        rawDate: (u as any).createdAt
      });
    });

    recentJobs.forEach(j => {
      recentActivities.push({
        id: idCounter++,
        action: 'Tin tuyển dụng mới',
        target: j.title,
        time: j.createdAt,
        type: 'job',
        rawDate: j.createdAt
      });
    });

    // Sort activities by date descending and take top 5
    recentActivities.sort((a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime());
    const topActivities = recentActivities.slice(0, 5).map(a => {
      // Simple time formatting (e.g. "Just now", "2 hours ago")
      const diffMs = new Date().getTime() - new Date(a.rawDate).getTime();
      const diffMins = Math.round(diffMs / 60000);
      let timeStr = `${diffMins} phút trước`;
      if (diffMins > 60) {
        const diffHrs = Math.round(diffMins / 60);
        timeStr = `${diffHrs} giờ trước`;
        if (diffHrs > 24) {
          timeStr = `${Math.round(diffHrs / 24)} ngày trước`;
        }
      }
      return { ...a, time: timeStr };
    });

    return {
      stats: {
        totalUsers,
        totalEmployers,
        totalJobs,
        activeJobs,
        pendingVerifications,
      },
      userGrowthData,
      jobsData: jobsByIndustry,
      recentActivities: topActivities,
    };
  }
}
