import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  FaChartBar,
  FaShoppingBag,
  FaList,
  FaShoppingCart,
  FaUsers,
  FaFileInvoice,
  FaCog,
  FaServer,
  FaStore,
  FaWarehouse,
  FaHeart,
  FaThLarge,
  FaTimes,
  FaCheckCircle,
} from 'react-icons/fa';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface NavTab {
  id: string;
  label: string;
  skLabel: string;
  icon: any;
  color: string;
  path: string;
  group: 'operations' | 'catalog' | 'system';
}

// Logicky usporiadané podľa dennej operatívy:
// 1. Prehľad & Objednávky/Financie -> 2. Ponuky & Katalóg -> 3. Správa & Systém
const navTabs: NavTab[] = [
  // Prehľad & Denná operatíva
  { id: 'overview', label: 'Overview', skLabel: 'Prehľad', icon: FaChartBar, color: 'from-blue-500 to-cyan-500', path: '/admin', group: 'operations' },
  { id: 'sales', label: 'Sales', skLabel: 'Consign predaje', icon: FaShoppingCart, color: 'from-green-500 to-emerald-500', path: '/admin/sales', group: 'operations' },
  { id: 'eshop-sales', label: 'Eshop', skLabel: 'E-shop predaje', icon: FaStore, color: 'from-teal-500 to-cyan-500', path: '/admin/eshop-sales', group: 'operations' },
  { id: 'invoices', label: 'Invoices', skLabel: 'Faktúry & Zmluvy', icon: FaFileInvoice, color: 'from-pink-500 to-rose-500', path: '/admin/invoices', group: 'operations' },
  { id: 'warehouse', label: 'Warehouse', skLabel: 'Sklad', icon: FaWarehouse, color: 'from-amber-500 to-orange-500', path: '/admin/warehouse', group: 'operations' },

  // Katalóg a ponuky
  { id: 'listed-products', label: 'Offers', skLabel: 'Ponuky užívateľov', icon: FaList, color: 'from-orange-500 to-amber-500', path: '/admin/listed-products', group: 'catalog' },
  { id: 'products', label: 'Products', skLabel: 'Katalóg tenisiek', icon: FaShoppingBag, color: 'from-purple-500 to-violet-500', path: '/admin/products', group: 'catalog' },
  { id: 'wtb-list', label: 'WTB', skLabel: 'Dopyt (WTB)', icon: FaHeart, color: 'from-rose-500 to-red-500', path: '/admin/wtb-list', group: 'catalog' },

  // Správa a nastavenia
  { id: 'users', label: 'Users', skLabel: 'Používatelia', icon: FaUsers, color: 'from-indigo-500 to-blue-500', path: '/admin/users', group: 'system' },
  { id: 'settings', label: 'Settings', skLabel: 'Nastavenia', icon: FaCog, color: 'from-gray-500 to-slate-500', path: '/admin/settings', group: 'system' },
  { id: 'system-status', label: 'System', skLabel: 'Stav systému', icon: FaServer, color: 'from-slate-500 to-gray-700', path: '/admin/system-status', group: 'system' },
];

export default function AdminNavigation() {
  const location = useLocation();
  const [showGridMenu, setShowGridMenu] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeItemRef = useRef<HTMLAnchorElement | null>(null);

  useEscapeKey(() => {
    setShowGridMenu(false);
  });

  // Kontrola posunu pre zobrazenie fade indikátorov
  const updateScrollIndicators = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
  }, []);

  // Automatické vycentrovanie aktívneho tabu pri načítaní a zmene trasy
  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeItemRef.current) {
        activeItemRef.current.scrollIntoView({
          behavior: 'smooth',
          inline: 'center',
          block: 'nearest',
        });
      }
      updateScrollIndicators();
    }, 60);

    return () => clearTimeout(timer);
  }, [location.pathname, updateScrollIndicators]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollIndicators, { passive: true });
    window.addEventListener('resize', updateScrollIndicators);
    return () => {
      el.removeEventListener('scroll', updateScrollIndicators);
      window.removeEventListener('resize', updateScrollIndicators);
    };
  }, [updateScrollIndicators]);

  return (
    <>
      <nav
        className="admin-mobile-nav bg-white border border-gray-200/90 shadow-xs mb-3 sm:mb-4 lg:mb-5 sm:rounded-2xl relative"
        aria-label="Admin navigation"
      >
        {/* Ľavý fade indikátor na mobile */}
        <div
          className={`pointer-events-none absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-white via-white/80 to-transparent z-10 transition-opacity duration-200 sm:hidden ${
            canScrollLeft ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Pravý fade indikátor na mobile */}
        <div
          className={`pointer-events-none absolute right-[58px] top-0 bottom-0 w-6 bg-gradient-to-l from-white via-white/80 to-transparent z-10 transition-opacity duration-200 sm:hidden ${
            canScrollRight ? 'opacity-100' : 'opacity-0'
          }`}
        />

        <div className="flex items-center justify-between p-1 sm:p-1.5">
          {/* Horizontálny kontajner tabov */}
          <div
            ref={containerRef}
            className="flex flex-1 items-center gap-1 sm:gap-1.5 overflow-x-auto admin-scrollbar py-0.5 sm:py-1 px-1"
            role="tablist"
          >
            {navTabs.map((tab, idx) => {
              const isActive =
                location.pathname === tab.path ||
                (tab.path !== '/admin' && location.pathname.startsWith(tab.path));
              const IconComponent = tab.icon;

              // Vizuálne jemné oddelenie skupín na desktope (po Warehouse a po WTB)
              const showDivider = idx === 4 || idx === 7;

              return (
                <div key={tab.id} className="flex items-center flex-shrink-0">
                  <Link
                    to={tab.path}
                    ref={isActive ? activeItemRef : undefined}
                    role="tab"
                    aria-selected={isActive}
                    aria-current={isActive ? 'page' : undefined}
                    className={`relative flex flex-shrink-0 items-center justify-center transition-all duration-150 select-none
                      /* Mobilné štýly: kompaktný pill s ikonou & textom */
                      flex-col gap-0.5 px-2.5 py-1.5 min-w-[62px] rounded-xl text-[10px] font-bold leading-tight
                      /* Desktopové štýly: horizontálny badge s plným kontrastom */
                      sm:flex-row sm:gap-2 sm:px-3 sm:py-2 md:px-3.5 md:py-2.5 sm:min-w-0 sm:text-xs md:text-sm
                      ${
                        isActive
                          ? 'bg-gray-900 text-white shadow-xs'
                          : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100/90 active:scale-95'
                      }
                    `}
                  >
                    <div
                      className={`flex-shrink-0 transition-transform ${
                        isActive ? 'text-white scale-105' : 'text-gray-400 group-hover:text-gray-600'
                      }`}
                    >
                      <IconComponent className="text-base sm:text-sm" />
                    </div>
                    <span className="truncate">{tab.label}</span>
                  </Link>

                  {/* Jemný vertikálny oddelovač medzi logickými skupinami na desktope */}
                  {showDivider && (
                    <div className="hidden sm:block h-5 w-px bg-gray-200 mx-1.5 flex-shrink-0" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Rýchly prepínač sekcií pre mobil (Menu button) */}
          <div className="flex-shrink-0 sm:hidden pl-1 pr-1 border-l border-gray-200/80 my-1">
            <button
              type="button"
              onClick={() => setShowGridMenu(true)}
              className="flex flex-col items-center justify-center gap-0.5 px-2 py-1 text-gray-600 hover:text-gray-900 active:bg-gray-100 rounded-xl transition-all cursor-pointer"
              title="Všetky sekcie administrácie"
              aria-label="Všetky sekcie"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gray-100 text-gray-700">
                <FaThLarge className="text-xs" />
              </div>
              <span className="text-[9px] font-bold text-gray-600 uppercase tracking-tighter">Menu</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobilný Grid Switcher Modal (Bottom Sheet s kategorizáciou) */}
      {showGridMenu && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-xs p-0 sm:items-center sm:p-4"
          onClick={() => setShowGridMenu(false)}
        >
          <div
            className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-gray-200 bg-white shadow-2xl sm:rounded-3xl animate-in slide-in-from-bottom-6 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Grabber handle */}
            <div className="pt-3 pb-1 flex justify-center sm:hidden">
              <div className="h-1.5 w-12 rounded-full bg-gray-300" />
            </div>

            {/* Sheet Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
              <div>
                <h3 className="text-base font-black text-gray-900 tracking-tight">Navigácia administrácie</h3>
                <p className="text-xs text-gray-500">Kategorizovaný rýchly prechod na ľubovoľnú sekciu</p>
              </div>
              <button
                type="button"
                onClick={() => setShowGridMenu(false)}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-900 transition-colors cursor-pointer"
              >
                <FaTimes className="text-xs" />
              </button>
            </div>

            {/* Kategórie sekcií */}
            <div className="overflow-y-auto p-4 sm:p-5 space-y-4">
              {/* Skupina 1: Predaje & Financie */}
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 px-1">
                  Predaje, Sklad & Financie
                </span>
                <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {navTabs.filter(t => t.group === 'operations').map(tab => {
                    const isActive =
                      location.pathname === tab.path ||
                      (tab.path !== '/admin' && location.pathname.startsWith(tab.path));
                    const IconComponent = tab.icon;

                    return (
                      <Link
                        key={tab.id}
                        to={tab.path}
                        onClick={() => setShowGridMenu(false)}
                        className={`group relative flex items-center gap-2.5 rounded-2xl p-2.5 transition-all ${
                          isActive
                            ? 'border-2 border-gray-900 bg-gray-50 shadow-xs'
                            : 'border border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 active:scale-95'
                        }`}
                      >
                        <div
                          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${tab.color} text-white shadow-xs`}
                        >
                          <IconComponent className="text-sm" />
                        </div>
                        <div className="text-left overflow-hidden">
                          <p className="text-xs font-bold text-gray-900 truncate leading-snug">{tab.label}</p>
                          <p className="text-[10px] text-gray-500 truncate leading-snug">{tab.skLabel}</p>
                        </div>
                        {isActive && (
                          <div className="absolute top-1.5 right-1.5 text-gray-900">
                            <FaCheckCircle className="text-[10px]" />
                          </div>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>

              {/* Skupina 2: Ponuky & Katalóg */}
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 px-1">
                  Katalóg & Ponuky
                </span>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  {navTabs.filter(t => t.group === 'catalog').map(tab => {
                    const isActive =
                      location.pathname === tab.path ||
                      (tab.path !== '/admin' && location.pathname.startsWith(tab.path));
                    const IconComponent = tab.icon;

                    return (
                      <Link
                        key={tab.id}
                        to={tab.path}
                        onClick={() => setShowGridMenu(false)}
                        className={`group relative flex flex-col items-center justify-center rounded-2xl p-2.5 text-center transition-all ${
                          isActive
                            ? 'border-2 border-gray-900 bg-gray-50 shadow-xs'
                            : 'border border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 active:scale-95'
                        }`}
                      >
                        <div
                          className={`mb-1.5 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${tab.color} text-white shadow-xs`}
                        >
                          <IconComponent className="text-sm" />
                        </div>
                        <p className="text-xs font-bold text-gray-900 truncate leading-snug">{tab.label}</p>
                        <p className="text-[10px] text-gray-500 truncate leading-snug">{tab.skLabel}</p>
                        {isActive && (
                          <div className="absolute top-1.5 right-1.5 text-gray-900">
                            <FaCheckCircle className="text-[10px]" />
                          </div>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>

              {/* Skupina 3: Správa & Nastavenia */}
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 px-1">
                  Správa & Nastavenia
                </span>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  {navTabs.filter(t => t.group === 'system').map(tab => {
                    const isActive =
                      location.pathname === tab.path ||
                      (tab.path !== '/admin' && location.pathname.startsWith(tab.path));
                    const IconComponent = tab.icon;

                    return (
                      <Link
                        key={tab.id}
                        to={tab.path}
                        onClick={() => setShowGridMenu(false)}
                        className={`group relative flex flex-col items-center justify-center rounded-2xl p-2.5 text-center transition-all ${
                          isActive
                            ? 'border-2 border-gray-900 bg-gray-50 shadow-xs'
                            : 'border border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 active:scale-95'
                        }`}
                      >
                        <div
                          className={`mb-1.5 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${tab.color} text-white shadow-xs`}
                        >
                          <IconComponent className="text-sm" />
                        </div>
                        <p className="text-xs font-bold text-gray-900 truncate leading-snug">{tab.label}</p>
                        <p className="text-[10px] text-gray-500 truncate leading-snug">{tab.skLabel}</p>
                        {isActive && (
                          <div className="absolute top-1.5 right-1.5 text-gray-900">
                            <FaCheckCircle className="text-[10px]" />
                          </div>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
