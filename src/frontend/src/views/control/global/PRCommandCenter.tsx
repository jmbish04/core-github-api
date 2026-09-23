import React, { useEffect, useState } from 'react';

interface PRJob {
  id: number;
  owner: string;
  repo: string;
  pull_number: number;
  status: string;
  created_at: number;
  updated_at: number;
}

export function PRCommandCenter() {
  const [jobs, setJobs] = useState<PRJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/pr-manager/jobs')
      .then((res) => res.json())
      .then((data) => {
        setJobs(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch PR jobs:', err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="p-8 text-white">Loading PR jobs...</div>;
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-6">PR Command Center</h1>
      <div className="overflow-x-auto bg-[#0a0a0a] rounded-lg border border-gray-800">
        <table className="min-w-full text-left text-sm whitespace-nowrap text-gray-300">
          <thead className="uppercase tracking-wider border-b border-gray-800 bg-[#111]">
            <tr>
              <th scope="col" className="px-6 py-4">ID</th>
              <th scope="col" className="px-6 py-4">Repository</th>
              <th scope="col" className="px-6 py-4">PR Number</th>
              <th scope="col" className="px-6 py-4">Status</th>
              <th scope="col" className="px-6 py-4">Updated At</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length > 0 ? (
              jobs.map((job) => (
                <tr key={job.id} className="border-b border-gray-800 hover:bg-[#1a1a1a]">
                  <td className="px-6 py-4">{job.id}</td>
                  <td className="px-6 py-4">{job.owner}/{job.repo}</td>
                  <td className="px-6 py-4 font-medium text-white">#{job.pull_number}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${job.status === 'conflict_resolved' ? 'bg-green-900/50 text-green-400' : job.status === 'conflict_commented' ? 'bg-yellow-900/50 text-yellow-400' : job.status === 'conflict_failed' ? 'bg-red-900/50 text-red-400' : 'bg-gray-800 text-gray-400'}`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">{new Date(job.updated_at).toLocaleString()}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  No PR jobs found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
