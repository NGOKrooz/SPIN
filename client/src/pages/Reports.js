import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Download, Calendar, Users, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { api } from '../services/api';
import { formatDate, getBatchColor, getWorkloadColor, getStatusColor } from '../lib/utils';

export default function Reports() {
  const [reportType, setReportType] = useState('summary');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [filterBatch, setFilterBatch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const { data: summaryReport, isLoading: summaryLoading } = useQuery({
    queryKey: ['reports', 'summary', { start_date: startDate, end_date: endDate }],
    queryFn: () => api.getSummaryReport({ start_date: startDate, end_date: endDate }),
    enabled: reportType === 'summary',
  });

  const { data: monthlySchedule, isLoading: scheduleLoading } = useQuery({
    queryKey: ['reports', 'monthly-schedule', month, year],
    queryFn: () => api.getMonthlySchedule(month, year),
    enabled: reportType === 'schedule',
  });

  const { data: internProgress, isLoading: progressLoading } = useQuery({
    queryKey: ['reports', 'intern-progress', { batch: filterBatch, status: filterStatus }],
    queryFn: () => api.getInternProgress({ batch: filterBatch, status: filterStatus }),
    enabled: reportType === 'progress',
  });

  const handleExportExcel = () => {
    const params = {
      start_date: startDate,
      end_date: endDate,
      month: month,
      year: year,
      batch: filterBatch,
      status: filterStatus,
    };
    api.exportExcel(reportType, params);
  };

  const handleExportPDF = () => {
    const params = {
      start_date: startDate,
      end_date: endDate,
      month: month,
      year: year,
      batch: filterBatch,
      status: filterStatus,
    };
    api.exportPDF(reportType, params);
  };

  const isLoading = summaryLoading || scheduleLoading || progressLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-600">Generate and export reports for internship management</p>
        </div>
        <div className="flex items-center space-x-3">
          <Button onClick={handleExportExcel} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export Excel
          </Button>
          <Button onClick={handleExportPDF} className="hospital-gradient">
            <FileText className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Report Type Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Report Configuration</CardTitle>
          <CardDescription>
            Select the type of report and configure filters
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label htmlFor="report-type">Report Type</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select report type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="summary">Summary Report</SelectItem>
                  <SelectItem value="schedule">Monthly Schedule</SelectItem>
                  <SelectItem value="progress">Intern Progress</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {reportType === 'summary' && (
              <>
                <div>
                  <Label htmlFor="start-date">Start Date</Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="end-date">End Date</Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </>
            )}

            {reportType === 'schedule' && (
              <>
                <div>
                  <Label htmlFor="month">Month</Label>
                  <Select value={month.toString()} onValueChange={(value) => setMonth(parseInt(value))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select month" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => (
                        <SelectItem key={i + 1} value={(i + 1).toString()}>
                          {new Date(0, i).toLocaleString('default', { month: 'long' })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="year">Year</Label>
                  <Input
                    id="year"
                    type="number"
                    min="2020"
                    max="2030"
                    value={year}
                    onChange={(e) => setYear(parseInt(e.target.value))}
                  />
                </div>
              </>
            )}

            {reportType === 'progress' && (
              <>
                <div>
                  <Label htmlFor="batch-filter">Batch</Label>
                  <Select value={filterBatch} onValueChange={setFilterBatch}>
                    <SelectTrigger>
                      <SelectValue placeholder="All batches" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All batches</SelectItem>
                      <SelectItem value="A">Batch A</SelectItem>
                      <SelectItem value="B">Batch B</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="status-filter">Status</Label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All statuses</SelectItem>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Extended">Extended</SelectItem>
                      <SelectItem value="Completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Report Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          {/* Summary Report */}
          {reportType === 'summary' && summaryReport && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <BarChart3 className="h-5 w-5" />
                    <span>Summary Report</span>
                  </CardTitle>
                  <CardDescription>
                    Overview of units, rotations, and coverage
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
                    <div className="text-center p-4 bg-blue-50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">{summaryReport.total_units}</div>
                      <div className="text-sm text-blue-600">Total Units</div>
                    </div>
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{summaryReport.total_rotations}</div>
                      <div className="text-sm text-green-600">Total Rotations</div>
                    </div>
                    <div className="text-center p-4 bg-purple-50 rounded-lg">
                      <div className="text-2xl font-bold text-purple-600">
                        {summaryReport.units.filter(u => u.coverage_status === 'good').length}
                      </div>
                      <div className="text-sm text-purple-600">Good Coverage</div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Unit Name
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Workload
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Total Interns
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Batch A
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Batch B
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Coverage
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {summaryReport.units.map((unit) => (
                          <tr key={unit.unit_name} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {unit.unit_name}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-white ${getWorkloadColor(unit.workload)}`}>
                                {unit.workload}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {unit.total_interns}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {unit.batch_a_count}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {unit.batch_b_count}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-white ${getWorkloadColor(unit.coverage_status)}`}>
                                {unit.coverage_status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Monthly Schedule Report */}
          {reportType === 'schedule' && monthlySchedule && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Calendar className="h-5 w-5" />
                  <span>Monthly Schedule - {new Date(0, month - 1).toLocaleString('default', { month: 'long' })} {year}</span>
                </CardTitle>
                <CardDescription>
                  Rotation schedule for the selected month
                </CardDescription>
              </CardHeader>
              <CardContent>
                {Object.keys(monthlySchedule.schedule).length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No rotations scheduled for this month
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(monthlySchedule.schedule).map(([date, units]) => (
                      <div key={date} className="border border-gray-200 rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 mb-3">{formatDate(date)}</h4>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {Object.entries(units).map(([unitName, interns]) => (
                            <div key={unitName} className="bg-gray-50 rounded-lg p-3">
                              <h5 className="font-medium text-gray-800 mb-2">{unitName}</h5>
                              <div className="space-y-1">
                                {interns.map((intern, index) => (
                                  <div key={index} className="flex items-center space-x-2 text-sm">
                                    <span className={`w-2 h-2 rounded-full ${getBatchColor(intern.batch)}`}></span>
                                    <span>{intern.intern_name}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Intern Progress Report */}
          {reportType === 'progress' && internProgress && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Users className="h-5 w-5" />
                  <span>Intern Progress Report</span>
                </CardTitle>
                <CardDescription>
                  Progress tracking for all interns
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Intern Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Batch
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Start Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Completed Rotations
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Progress
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Days in Internship
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {internProgress.map((intern) => (
                        <tr key={intern.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {intern.name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-white ${getBatchColor(intern.batch)}`}>
                              {intern.batch}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatDate(intern.start_date)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(intern.status)}`}>
                              {intern.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {intern.completed_rotations}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center space-x-2">
                              <div className="w-16 bg-gray-200 rounded-full h-2">
                                <div 
                                  className="bg-blue-600 h-2 rounded-full" 
                                  style={{ width: `${intern.progress_percentage}%` }}
                                ></div>
                              </div>
                              <span className="text-sm text-gray-500">{intern.progress_percentage}%</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {intern.days_internship}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
