import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { MainLayout } from '../pages/MainLayout';
import HomePage from '../pages/HomePage';
import ResultPage from '../pages/ResultPage';
import DependencyDetailPage from '../pages/DependencyDetailPage';
import LeaderboardPage from '../pages/LeaderboardPage';

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
        path: 'leaderboard',
        element: <LeaderboardPage />
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
