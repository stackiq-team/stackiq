import './Header.css';
import { useLocation, useNavigate } from 'react-router-dom';

export function Header() {
    const navigate = useNavigate();
    const location = useLocation();

    return (
        <header className="navbar">
            <div className="nav-left">
            <button className="logo-button" onClick={() => navigate('/')}>
                <span className="logo-mark">S</span>
                <span className="logo">StackIQ</span>
            </button>
            <nav className="nav-links">
                <button className={location.pathname === '/' ? 'active' : ''} onClick={() => navigate('/')}>Analyze</button>
                <button className={location.pathname.startsWith('/explore') || location.pathname === '/leaderboard' ? 'active' : ''} onClick={() => navigate('/explore')}>Explore</button>
            </nav>
            </div>
            <div className="nav-right" />
        </header>
    );
}
