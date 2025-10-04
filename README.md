# SPIN - Smart Physiotherapy Internship Network

A comprehensive system for managing intern rotation schedules at the University of Nigeria Teaching Hospital (UNTH), Ituku Ozalla, Enugu State, Nigeria.

## 🏥 Overview

SPIN automates and manages rotation schedules for physiotherapy interns across different hospital units, handling batch alternation logic, dynamic workload tracking, and continuous coverage of all units throughout the internship year.

## ✨ Features

- **Intern Management**: Add, view, and edit intern profiles with automatic duration calculation
- **Batch Alternation**: Batch A (Monday off) and Batch B (Wednesday off) with continuous coverage
- **Unit Management**: 12 predefined units with varying durations (21-30 days)
- **Rotation Logic**: Automatic rotation calculation based on start dates
- **Manual Assignment**: Admin override capabilities for special cases
- **Workload Tracking**: Weekly workload updates with coverage warnings
- **Reporting**: PDF/Excel export for schedules and summaries

## 🏗️ Architecture

- **Frontend**: React with TailwindCSS and shadcn/ui
- **Backend**: Node.js with Express.js
- **Database**: SQLite for development, PostgreSQL for production
- **API**: RESTful endpoints for all operations

## 🚀 Quick Start

1. **Install Dependencies**
   ```bash
   npm run install-all
   ```

2. **Start Development Server**
   ```bash
   npm run dev
   ```

3. **Access the Application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5000

## 📁 Project Structure

```
SPIN/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/         # Main application pages
│   │   ├── hooks/         # Custom React hooks
│   │   ├── services/      # API service functions
│   │   └── utils/         # Utility functions
├── server/                # Express.js backend
│   ├── routes/           # API route handlers
│   ├── models/           # Database models
│   ├── middleware/       # Custom middleware
│   └── utils/            # Server utilities
└── docs/                 # Documentation
```

## 🏥 Hospital Units

1. Adult Neurology – 21 days
2. Acute Stroke – 30 days
3. Neurosurgery – 30 days
4. Geriatrics – 30 days
5. Orthopedic Inpatients – 30 days
6. Orthopedic Outpatients – 30 days
7. Electrophysiology – 30 days
8. Exercise Immunology – 30 days
9. Women's Health – 30 days
10. Pediatrics Inpatients – 21 days
11. Pediatrics Outpatients – 21 days
12. Cardio Thoracic Unit – 30 days

## 📋 Batch Schedule

- **Batch A**: Off on Mondays
- **Batch B**: Off on Wednesdays
- Continuous coverage maintained across all units

## 🛠️ Development

### Prerequisites
- Node.js 18+
- npm or yarn

### Environment Setup
1. Copy `.env.example` to `.env` in both client and server directories
2. Configure database and API settings
3. Run `npm run install-all` to install all dependencies

### Testing
```bash
npm test
```

## 📄 License

MIT License - see LICENSE file for details

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📞 Support

For support and questions, please contact the development team or create an issue in the repository.
