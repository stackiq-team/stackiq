import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { MainLayout } from '../pages/MainLayout';
import  HomePage  from '../pages/HomePage';
const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      {
        index: true,
        element: <HomePage/>
      },
    ]
  }
]);

export default function App() {
  return <RouterProvider router={router} />;
}