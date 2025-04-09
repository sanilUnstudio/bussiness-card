import { useState } from 'react';
import { X } from 'lucide-react';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setMessage('Please select a CSV file first.');
      return;
    }

    setLoading(true);
    setMessage('Processing...');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Failed to process file.');
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = 'enriched.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);

      setMessage('Done! Downloading enriched file...');
    } catch (err) {
      const error = err as Error;
      setMessage('Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 gap-4">
      <h1 className="text-2xl font-bold">Upload Business Card CSV</h1>

      <div onClick={() => {
        const elem = document.getElementById('input-csv') as HTMLInputElement | null;
        elem?.click();
      }} className='relative border-dotted border border-gray-300 p-2 h-[40vh] w-7/12 flex items-center justify-center rounded-lg'>
        <input type="file" id='input-csv' accept=".csv" onChange={handleFileChange} className='hidden' />
        {!file && <h1>Click here to upload csv file</h1>}
        {file && <h1>{file.name}</h1>}
        {file && <X className='absolute top-3 right-3' onClick={() => setFile(null)} />}
      </div>

      <button
        onClick={handleUpload}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
      >
        {loading ? 'Processing...' : 'Extract Company & Email'}
      </button>
    </main>
  );
}
