import './Header.css';
import { useLocation, useNavigate } from 'react-router-dom';
import { languageLabels, useTranslation, type Language } from '../i18n/LanguageContext';

export function Header() {
    const navigate = useNavigate();
    const location = useLocation();
    const { language, setLanguage, t } = useTranslation();

    return (
        <header className="navbar">
            <div className="nav-left">
            <button className="logo-button" onClick={() => navigate('/')}>
                <span className="logo-mark">S</span>
                <span className="logo">StackIQ</span>
            </button>
            <nav className="nav-links">
                <button className={location.pathname === '/' ? 'active' : ''} onClick={() => navigate('/')}>{t("nav.analyze")}</button>
                <button className={location.pathname.startsWith('/explore') || location.pathname === '/leaderboard' ? 'active' : ''} onClick={() => navigate('/explore')}>{t("nav.explore")}</button>
            </nav>
            </div>
            <div className="nav-right">
                <div className="language-switcher" role="group" aria-label={t("nav.language")}>
                    <div className="language-options">
                        {(Object.keys(languageLabels) as Language[]).map((option) => (
                            <button
                                key={option}
                                type="button"
                                className={language === option ? "active" : ""}
                                onClick={() => setLanguage(option)}
                                aria-pressed={language === option}
                                title={languageLabels[option]}
                            >
                                {option.toUpperCase()}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </header>
    );
}
