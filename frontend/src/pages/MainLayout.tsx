import { Outlet } from 'react-router-dom';
import './MainLayout.css';
import { Header } from '../common/Header';

export const MainLayout = () => {
  return (
    <div className="app-container">
      <Header />
      <main>
        <Outlet /> 
      </main>
    </div>
  );
}
export default MainLayout