'use client';
import { useEffect, useState } from 'react';

export default function Home() {
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    fetch('http://localhost:3000/users')
        .then((res) => res.json())
        .then((data) => {
          setUsers(data);
        })
        .catch((err) => console.error('cannot connect to backend:', err));
  }, []);

  return (
      <div className="p-10 font-sans">
        <h1 className="text-3xl font-bold mb-6">fullstack userlist</h1>

        <div className="bg-gray-100 p-6 rounded-lg shadow-md">
          {users.length > 0 ? (
              <ul className="space-y-4">
                {users.map((user) => (
                    <li key={user.id} className="p-4 bg-white rounded shadow">
                      <span className="font-mono text-blue-600">#{user.id}</span>
                      <span className="ml-4 text-xl">{user.username}</span>
                      <span className="ml-4 px-2 py-1 bg-green-100 text-green-700 text-sm rounded">
                  {user.isActive ? 'Active' : 'Inactive'}
                </span>
                    </li>
                ))}
              </ul>
          ) : (
              <p className="text-gray-500">pulling from backend...</p>
          )}
        </div>
      </div>
  );
}