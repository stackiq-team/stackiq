import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { MainLayout } from '../pages/MainLayout';
import HomePage from '../pages/HomePage';
import ResultPage from '../pages/ResultPage';
import DependencyDetailPage from '../pages/DependencyDetailPage';
import LeaderboardPage from '../pages/LeaderboardPage';
import { Navigate } from 'react-router-dom';

const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      {
        index: true,
        element: <HomePage />
      },
      {
        path: 'explore',
        element: <LeaderboardPage />
      },
      {
        path: 'explore/*',
        element: <Navigate to="/explore" replace />
      },
      {
        path: 'leaderboard',
        element: <Navigate to="/explore" replace />
      },
      {
        path: 'results/:resultToken',
        element: <ResultPage />
      },
      {
        path: 'results/:resultToken/dependency/:dependencyName',
        element: <DependencyDetailPage />
      }
    ]
  }
]);
  
export default function App() {
  return <RouterProvider router={router} />;
}
