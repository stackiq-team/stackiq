import './Header.css';
import { useLocation, useNavigate } from 'react-router-dom';

export function Header() {
    const navigate = useNavigate();
    const location = useLocation();
    const isResultPage = location.pathname.startsWith('/results');

    return (
        <header className="navbar">
            <div className="nav-left">
            <button className="logo-button" onClick={() => navigate('/')}>
                <span className="logo-mark">S</span>
                <span className="logo">StackIQ</span>
            </button>
            <nav className="nav-links">
                <button className={location.pathname === '/' ? 'active' : ''} onClick={() => navigate('/')}>Analyze</button>
                {isResultPage && <span className="nav-context">Dependency intelligence</span>}
            </nav>
            </div>
            <div className="nav-right" />
        </header>
    );
}
