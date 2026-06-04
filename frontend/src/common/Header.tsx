import './Header.css';
import { useLocation, useNavigate } from 'react-router-dom';

export function Header() {
    const navigate = useNavigate();
    const location = useLocation();

    return (
        <header className="navbar">
            <div className="nav-left">
            <div className="logo">StackIQ</div>
            <nav className="nav-links">
                <button className={location.pathname === '/' ? 'active' : ''} onClick={() => navigate('/')}>Home Page</button>
            </nav>
            </div>
            <div className="nav-right">
            </div>
        </header>
    );
}