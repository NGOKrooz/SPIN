const express = require('express');
const { getDatabase } = require('../database/init');
const ExcelJS = require('exceljs');
const puppeteer = require('puppeteer');
const { format, parseISO, startOfMonth, endOfMonth } = require('date-fns');

const router = express.Router();
const db = getDatabase();

// GET /api/reports/summary - Get summary report
router.get('/summary', (req, res) => {
  const { start_date, end_date } = req.query;
  
  const dateFilter = start_date && end_date 
    ? `AND r.start_date >= '${start_date}' AND r.end_date <= '${end_date}'`
    : '';
  
  const query = `
    SELECT 
      u.name as unit_name,
      u.workload,
      COUNT(DISTINCT r.intern_id) as total_interns,
      COUNT(CASE WHEN i.batch = 'A' THEN 1 END) as batch_a_count,
      COUNT(CASE WHEN i.batch = 'B' THEN 1 END) as batch_b_count,
      AVG(u.duration_days) as avg_duration
    FROM units u
    LEFT JOIN rotations r ON u.id = r.unit_id ${dateFilter}
    LEFT JOIN interns i ON r.intern_id = i.id
    GROUP BY u.id, u.name, u.workload
    ORDER BY u.name
  `;
  
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Error generating summary report:', err);
      return res.status(500).json({ error: 'Failed to generate summary report' });
    }
    
    const summary = {
      total_units: rows.length,
      total_rotations: rows.reduce((sum, row) => sum + (row.total_interns || 0), 0),
      units: rows.map(row => ({
        ...row,
        total_interns: row.total_interns || 0,
        batch_a_count: row.batch_a_count || 0,
        batch_b_count: row.batch_b_count || 0,
        coverage_status: getCoverageStatus(row.total_interns, row.workload)
      }))
    };
    
    res.json(summary);
  });
});

// GET /api/reports/monthly-schedule - Get monthly rotation schedule
router.get('/monthly-schedule', (req, res) => {
  const { month, year } = req.query;
  const targetMonth = month || new Date().getMonth() + 1;
  const targetYear = year || new Date().getFullYear();
  
  const startDate = format(new Date(targetYear, targetMonth - 1, 1), 'yyyy-MM-dd');
  const endDate = format(new Date(targetYear, targetMonth, 0), 'yyyy-MM-dd');
  
  const query = `
    SELECT 
      r.*,
      i.name as intern_name,
      i.batch as intern_batch,
      u.name as unit_name,
      u.workload
    FROM rotations r
    JOIN interns i ON r.intern_id = i.id
    JOIN units u ON r.unit_id = u.id
    WHERE (
      (r.start_date <= ? AND r.end_date >= ?) OR
      (r.start_date >= ? AND r.start_date <= ?) OR
      (r.end_date >= ? AND r.end_date <= ?)
    )
    ORDER BY r.start_date, u.name, i.batch
  `;
  
  db.all(query, [endDate, startDate, startDate, endDate, startDate, endDate], (err, rows) => {
    if (err) {
      console.error('Error generating monthly schedule:', err);
      return res.status(500).json({ error: 'Failed to generate monthly schedule' });
    }
    
    // Group by date and unit
    const schedule = {};
    rows.forEach(rotation => {
      const date = format(parseISO(rotation.start_date), 'yyyy-MM-dd');
      if (!schedule[date]) {
        schedule[date] = {};
      }
      if (!schedule[date][rotation.unit_name]) {
        schedule[date][rotation.unit_name] = [];
      }
      schedule[date][rotation.unit_name].push({
        intern_name: rotation.intern_name,
        batch: rotation.intern_batch,
        start_date: rotation.start_date,
        end_date: rotation.end_date
      });
    });
    
    res.json({
      month: targetMonth,
      year: targetYear,
      schedule
    });
  });
});

// GET /api/reports/intern-progress - Get intern progress report
router.get('/intern-progress', (req, res) => {
  const { batch, status } = req.query;
  
  let query = `
    SELECT 
      i.*,
      COUNT(r.id) as completed_rotations,
      GROUP_CONCAT(u.name, '|') as completed_units,
      MIN(r.start_date) as first_rotation,
      MAX(r.end_date) as last_rotation
    FROM interns i
    LEFT JOIN rotations r ON i.id = r.intern_id AND r.end_date < date('now')
    LEFT JOIN units u ON r.unit_id = u.id
  `;
  
  const conditions = [];
  const params = [];
  
  if (batch) {
    conditions.push('i.batch = ?');
    params.push(batch);
  }
  
  if (status) {
    conditions.push('i.status = ?');
    params.push(status);
  }
  
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  
  query += ' GROUP BY i.id ORDER BY i.start_date';
  
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Error generating intern progress report:', err);
      return res.status(500).json({ error: 'Failed to generate intern progress report' });
    }
    
    const progress = rows.map(row => ({
      ...row,
      completed_units: row.completed_units ? row.completed_units.split('|') : [],
      progress_percentage: Math.round((row.completed_rotations / 12) * 100),
      days_internship: differenceInDays(new Date(), parseISO(row.start_date))
    }));
    
    res.json(progress);
  });
});

// GET /api/reports/export/excel - Export to Excel
router.get('/export/excel', async (req, res) => {
  try {
    const { type, start_date, end_date } = req.query;
    
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SPIN System';
    workbook.created = new Date();
    
    if (type === 'summary' || !type) {
      await generateSummarySheet(workbook, start_date, end_date);
    }
    
    if (type === 'schedule' || !type) {
      await generateScheduleSheet(workbook, start_date, end_date);
    }
    
    if (type === 'progress' || !type) {
      await generateProgressSheet(workbook);
    }
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=spin-report.xlsx');
    
    await workbook.xlsx.write(res);
    res.end();
    
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    res.status(500).json({ error: 'Failed to export to Excel' });
  }
});

// GET /api/reports/export/pdf - Export to PDF
router.get('/export/pdf', async (req, res) => {
  try {
    const { type, start_date, end_date } = req.query;
    
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    // Generate HTML content based on type
    let htmlContent = '';
    
    if (type === 'summary') {
      htmlContent = await generateSummaryHTML(start_date, end_date);
    } else if (type === 'schedule') {
      htmlContent = await generateScheduleHTML(start_date, end_date);
    } else {
      htmlContent = await generateSummaryHTML(start_date, end_date);
    }
    
    await page.setContent(htmlContent);
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '20mm',
        bottom: '20mm',
        left: '20mm'
      }
    });
    
    await browser.close();
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=spin-report.pdf');
    res.send(pdf);
    
  } catch (error) {
    console.error('Error exporting to PDF:', error);
    res.status(500).json({ error: 'Failed to export to PDF' });
  }
});

// Helper functions for Excel export
async function generateSummarySheet(workbook, startDate, endDate) {
  const worksheet = workbook.addWorksheet('Summary Report');
  
  // Headers
  worksheet.columns = [
    { header: 'Unit Name', key: 'unit_name', width: 25 },
    { header: 'Workload', key: 'workload', width: 12 },
    { header: 'Total Interns', key: 'total_interns', width: 15 },
    { header: 'Batch A', key: 'batch_a_count', width: 12 },
    { header: 'Batch B', key: 'batch_b_count', width: 12 },
    { header: 'Coverage Status', key: 'coverage_status', width: 15 }
  ];
  
  // Get data
  const query = `
    SELECT 
      u.name as unit_name,
      u.workload,
      COUNT(DISTINCT r.intern_id) as total_interns,
      COUNT(CASE WHEN i.batch = 'A' THEN 1 END) as batch_a_count,
      COUNT(CASE WHEN i.batch = 'B' THEN 1 END) as batch_b_count
    FROM units u
    LEFT JOIN rotations r ON u.id = r.unit_id
    LEFT JOIN interns i ON r.intern_id = i.id
    GROUP BY u.id, u.name, u.workload
    ORDER BY u.name
  `;
  
  return new Promise((resolve, reject) => {
    db.all(query, [], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      
      rows.forEach(row => {
        worksheet.addRow({
          ...row,
          coverage_status: getCoverageStatus(row.total_interns, row.workload)
        });
      });
      
      resolve();
    });
  });
}

async function generateScheduleSheet(workbook, startDate, endDate) {
  const worksheet = workbook.addWorksheet('Rotation Schedule');
  
  worksheet.columns = [
    { header: 'Intern Name', key: 'intern_name', width: 20 },
    { header: 'Batch', key: 'batch', width: 8 },
    { header: 'Unit', key: 'unit_name', width: 25 },
    { header: 'Start Date', key: 'start_date', width: 12 },
    { header: 'End Date', key: 'end_date', width: 12 },
    { header: 'Duration (Days)', key: 'duration', width: 15 }
  ];
  
  const query = `
    SELECT 
      i.name as intern_name,
      i.batch,
      u.name as unit_name,
      r.start_date,
      r.end_date,
      u.duration_days as duration
    FROM rotations r
    JOIN interns i ON r.intern_id = i.id
    JOIN units u ON r.unit_id = u.id
    ORDER BY r.start_date, u.name
  `;
  
  return new Promise((resolve, reject) => {
    db.all(query, [], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      
      rows.forEach(row => {
        worksheet.addRow(row);
      });
      
      resolve();
    });
  });
}

async function generateProgressSheet(workbook) {
  const worksheet = workbook.addWorksheet('Intern Progress');
  
  worksheet.columns = [
    { header: 'Intern Name', key: 'name', width: 20 },
    { header: 'Batch', key: 'batch', width: 8 },
    { header: 'Start Date', key: 'start_date', width: 12 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Completed Rotations', key: 'completed_rotations', width: 20 },
    { header: 'Progress %', key: 'progress_percentage', width: 15 }
  ];
  
  const query = `
    SELECT 
      i.*,
      COUNT(r.id) as completed_rotations
    FROM interns i
    LEFT JOIN rotations r ON i.id = r.intern_id AND r.end_date < date('now')
    GROUP BY i.id
    ORDER BY i.start_date
  `;
  
  return new Promise((resolve, reject) => {
    db.all(query, [], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      
      rows.forEach(row => {
        worksheet.addRow({
          ...row,
          progress_percentage: Math.round((row.completed_rotations / 12) * 100)
        });
      });
      
      resolve();
    });
  });
}

// Helper functions for PDF export
async function generateSummaryHTML(startDate, endDate) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>SPIN Summary Report</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #2563eb; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .critical { background-color: #fef2f2; color: #dc2626; }
        .warning { background-color: #fffbeb; color: #d97706; }
        .good { background-color: #f0fdf4; color: #16a34a; }
      </style>
    </head>
    <body>
      <h1>SPIN - Summary Report</h1>
      <p>Generated on: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}</p>
      <p>Report Period: ${startDate || 'All time'} to ${endDate || 'Present'}</p>
      
      <table>
        <thead>
          <tr>
            <th>Unit Name</th>
            <th>Workload</th>
            <th>Total Interns</th>
            <th>Batch A</th>
            <th>Batch B</th>
            <th>Coverage Status</th>
          </tr>
        </thead>
        <tbody>
          <!-- Data will be populated by the query -->
        </tbody>
      </table>
    </body>
    </html>
  `;
}

async function generateScheduleHTML(startDate, endDate) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>SPIN Rotation Schedule</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #2563eb; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
      </style>
    </head>
    <body>
      <h1>SPIN - Rotation Schedule</h1>
      <p>Generated on: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}</p>
      
      <table>
        <thead>
          <tr>
            <th>Intern Name</th>
            <th>Batch</th>
            <th>Unit</th>
            <th>Start Date</th>
            <th>End Date</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          <!-- Data will be populated by the query -->
        </tbody>
      </table>
    </body>
    </html>
  `;
}

function getCoverageStatus(internCount, workload) {
  const count = parseInt(internCount) || 0;
  
  // Units with 0 interns require immediate attention - should be critical
  if (count === 0) {
    return 'critical';
  }
  
  if (workload === 'High' && count < 2) {
    return 'critical';
  } else if (workload === 'Medium' && count < 2) {
    return 'critical';
  } else if (workload === 'Low' && count < 1) {
    return 'warning';
  } else {
    return 'good';
  }
}

module.exports = router;
