import { Link, useLocation } from 'react-router-dom';
import {
  FaChartBar,
  FaShoppingBag,
  FaList,
  FaShoppingCart,
  FaUsers,
  FaCog
} from 'react-icons/fa';

interface NavTab {
  id: string;
  label: string;
  icon: any;
  color: string;
  path: string;
}

const navTabs: NavTab[] = [
  { id: 'overview', label: 'Prehľad', icon: FaChartBar, color: 'from-blue-500 to-cyan-500', path: '/admin' },
  { id: 'products', label: 'Produkty', icon: FaShoppingBag, color: 'from-purple-500 to-violet-500', path: '/admin/products' },
  { id: 'listed-products', label: 'Ponuky', icon: FaList, color: 'from-orange-500 to-amber-500', path: '/admin/listed-products' },
  { id: 'sales', label: 'Predaje', icon: FaShoppingCart, color: 'from-green-500 to-emerald-500', path: '/admin/sales' },
  { id: 'users', label: 'Užívatelia', icon: FaUsers, color: 'from-indigo-500 to-blue-500', path: '/admin/users' },
  { id: 'settings', label: 'Nastavenia', icon: FaCog, color: 'from-gray-500 to-slate-500', path: '/admin/settings' },
];

export default function AdminNavigation() {
  const location = useLocation();

  return (
    <>
      {/* Desktop Navigation - Horizontal Tabs */}
      <div className="hidden md:block bg-white rounded-2xl border border-gray-200 shadow-2xl mb-8 overflow-hidden">
        <div className="flex overflow-x-auto">
          {navTabs.map((tab) => {
            const isActive = location.pathname === tab.path;
            const IconComponent = tab.icon;
            return (
              <Link
                key={tab.id}
                to={tab.path}
                className={`relative flex items-center px-4 lg:px-6 py-4 font-semibold transition-all duration-300 min-w-max ${
                  isActive ? 'text-gray-900' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {isActive && (
                  <div className={`absolute inset-0 bg-gradient-to-r ${tab.color} opacity-20 rounded-lg`}></div>
                )}
                <IconComponent className={`mr-2 text-sm ${isActive ? `text-transparent bg-gradient-to-r ${tab.color} bg-clip-text` : 'text-gray-600'}`} />
                <span className={isActive ? `bg-gradient-to-r ${tab.color} bg-clip-text text-transparent font-bold` : 'text-gray-600'}>
                  {tab.label}
                </span>
                {isActive && (
                  <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${tab.color} rounded-full`}></div>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Mobile Navigation - Bottom Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-2xl z-50 safe-area-inset-bottom">
        <div className="flex justify-around items-center px-1 py-1.5 max-w-screen-sm mx-auto">
          {navTabs.map((tab) => {
            const isActive = location.pathname === tab.path;
            const IconComponent = tab.icon;
            return (
              <Link
                key={tab.id}
                to={tab.path}
                className={`relative flex flex-col items-center justify-center px-1.5 py-1.5 rounded-lg transition-all duration-200 min-w-0 flex-1 ${
                  isActive ? 'bg-gray-50' : 'active:bg-gray-100'
                }`}
              >
                <IconComponent 
                  className={`text-base mb-0.5 ${
                    isActive 
                      ? `text-transparent bg-gradient-to-r ${tab.color} bg-clip-text` 
                      : 'text-gray-500'
                  }`} 
                />
                <span className={`text-[10px] font-medium truncate w-full text-center leading-tight ${
                  isActive 
                    ? `bg-gradient-to-r ${tab.color} bg-clip-text text-transparent font-semibold` 
                    : 'text-gray-500'
                }`}>
                  {tab.label}
                </span>
                {isActive && (
                  <div className={`absolute top-0 left-1/2 transform -translate-x-1/2 w-8 h-0.5 bg-gradient-to-r ${tab.color} rounded-full`}></div>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Spacer for mobile bottom nav */}
      <div className="md:hidden h-20 pb-safe"></div>
    </>
  );
}

