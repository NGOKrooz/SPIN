import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { X, Users } from 'lucide-react';
import { api } from '../services/api';
import { getBatchColor, formatDate, normalizeDate, calculateDaysBetween, exportToCSV, openPrintableWindow } from '../lib/utils';

export default function UnitViewModal({ unit, onClose }) {
  const { data: unitDetails, isLoading, error } = useQuery({
    queryKey: ['unit', unit?.id],
    queryFn: () => api.getUnit(unit.id),
    enabled: !!unit?.id,
  });

  const activeUnit = unitDetails || unit;
  const rotations = activeUnit?.current_rotations || [];
  const today = normalizeDate(new Date());

  const currentInterns = rotations.filter(r => {
    const start = normalizeDate(r.start_date);
    const end = normalizeDate(r.end_date);
    return start <= today && end >= today;
  });

  const pastInterns = rotations.filter(r => {
    const end = normalizeDate(r.end_date);
    return end < today;
  });

  const handleExportCsv = () => {
    try {
      const rows = [
        ...currentInterns.map(r => ({
          section: 'Current',
          name: r.intern_name,
          batch: r.intern_batch,
          joined_date: r.start_date,
          left_date: '',
          duration_days: calculateDaysBetween(r.start_date, r.end_date)
        })),
        ...pastInterns.map(r => ({
          section: 'History',
          name: r.intern_name,
          batch: r.intern_batch,
          joined_date: r.start_date,
          left_date: r.end_date,
          duration_days: calculateDaysBetween(r.start_date, r.end_date)
        }))
      ];

      exportToCSV(`${activeUnit.name}-interns`, rows, ['section', 'name', 'batch', 'joined_date', 'left_date', 'duration_days']);
    } catch (err) {
      alert('Export failed: ' + err.message);
    }
  };

  const handleDownloadPdf = () => {
    try {
      const currentRows = currentInterns.map(r => `
        <tr>
          <td>${r.intern_name}</td>
          <td>${r.intern_batch}</td>
          <td>${formatDate(r.start_date)}</td>
          <td>${calculateDaysBetween(r.start_date, r.end_date)} days</td>
        </tr>
      `).join('');

      const pastRows = pastInterns.map(r => `
        <tr>
          <td>${r.intern_name}</td>
          <td>${formatDate(r.start_date)}</td>
          <td>${formatDate(r.end_date)}</td>
          <td>${calculateDaysBetween(r.start_date, r.end_date)} days</td>
        </tr>
      `).join('');

      const html = `
        <h2>${activeUnit.name}</h2>
        <h3>Current Interns</h3>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Batch</th>
              <th>Joined Date</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            ${currentRows || '<tr><td colspan="4">No current interns</td></tr>'}
          </tbody>
        </table>
        <h3>Past Interns (History)</h3>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Joined Date</th>
              <th>Left Date</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            ${pastRows || '<tr><td colspan="4">No past interns</td></tr>'}
          </tbody>
        </table>
      `;

      openPrintableWindow(`${activeUnit.name} - Interns`, html);
    } catch (err) {
      alert('PDF export failed: ' + err.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="flex items-center space-x-2">
            <Users className="h-5 w-5" />
            <span>Unit Details</span>
          </CardTitle>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={handleExportCsv}>Export CSV</Button>
            <Button variant="outline" size="sm" onClick={handleDownloadPdf}>Download PDF</Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <div className="text-red-600 mb-2">Error loading unit details</div>
              <div className="text-sm text-gray-500">{error.message}</div>
            </div>
          ) : (
            <>
              <div className="text-xl font-semibold text-gray-900">{activeUnit.name}</div>

              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-700">Current Interns</div>
                {currentInterns.length === 0 ? (
                  <div className="text-sm text-gray-500">No current interns</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 border-b">
                          <th className="py-2">Name</th>
                          <th className="py-2">Batch</th>
                          <th className="py-2">Joined Date</th>
                          <th className="py-2">Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentInterns.map((intern) => (
                          <tr key={intern.id} className="border-b last:border-b-0">
                            <td className="py-2">{intern.intern_name}</td>
                            <td className="py-2">
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getBatchColor(intern.intern_batch)}`}>
                                Batch {intern.intern_batch}
                              </span>
                            </td>
                            <td className="py-2">{formatDate(intern.start_date)}</td>
                            <td className="py-2">{calculateDaysBetween(intern.start_date, intern.end_date)} days</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-700">Past Interns (History)</div>
                {pastInterns.length === 0 ? (
                  <div className="text-sm text-gray-500">No past interns</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 border-b">
                          <th className="py-2">Name</th>
                          <th className="py-2">Joined Date</th>
                          <th className="py-2">Left Date</th>
                          <th className="py-2">Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pastInterns.map((intern) => (
                          <tr key={intern.id} className="border-b last:border-b-0">
                            <td className="py-2">{intern.intern_name}</td>
                            <td className="py-2">{formatDate(intern.start_date)}</td>
                            <td className="py-2">{formatDate(intern.end_date)}</td>
                            <td className="py-2">{calculateDaysBetween(intern.start_date, intern.end_date)} days</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
