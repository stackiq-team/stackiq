import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { MainLayout } from '../pages/MainLayout';
import  HomePage  from '../pages/HomePage';
import ResultPage from '../pages/ResultPage';

const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      {
        index: true,
        element: <HomePage/>
      },
      {
        path: 'results/:resultToken',
        element: <ResultPage/>
      }
    ]
  }
]);
  
export default function App() {
  return <RouterProvider router={router} />;
}
