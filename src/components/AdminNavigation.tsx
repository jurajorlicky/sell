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
  { id: 'overview', label: 'Overview', icon: FaChartBar, color: 'from-blue-500 to-cyan-500', path: '/admin' },
  { id: 'products', label: 'Products', icon: FaShoppingBag, color: 'from-purple-500 to-violet-500', path: '/admin/products' },
  { id: 'listed-products', label: 'Offers', icon: FaList, color: 'from-orange-500 to-amber-500', path: '/admin/listed-products' },
  { id: 'sales', label: 'Sales', icon: FaShoppingCart, color: 'from-green-500 to-emerald-500', path: '/admin/sales' },
  { id: 'users', label: 'Users', icon: FaUsers, color: 'from-indigo-500 to-blue-500', path: '/admin/users' },
  { id: 'settings', label: 'Settings', icon: FaCog, color: 'from-gray-500 to-slate-500', path: '/admin/settings' },
];

export default function AdminNavigation() {
  const location = useLocation();

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl mb-4 sm:mb-6 lg:mb-8 overflow-hidden">
      <div className="flex justify-around sm:justify-start overflow-x-auto">
        {navTabs.map((tab) => {
          // More robust pathname matching - exact match or starts with path
          const isActive = location.pathname === tab.path || 
            (tab.path !== '/admin' && location.pathname.startsWith(tab.path));
          const IconComponent = tab.icon;
          return (
            <Link
              key={tab.id}
              to={tab.path}
              className={`relative flex items-center justify-center sm:justify-start px-2 sm:px-3 md:px-4 lg:px-6 py-2.5 sm:py-3 md:py-4 font-semibold transition-all duration-300 flex-1 sm:flex-initial min-w-0 sm:min-w-max ${
                isActive 
                  ? 'text-gray-900' 
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <IconComponent className={`text-lg sm:text-lg md:text-sm sm:mr-2 flex-shrink-0 ${
                isActive 
                  ? 'text-gray-900' 
                  : 'text-gray-600'
              }`} />
              <span className={`hidden sm:inline ${
                isActive 
                  ? 'text-gray-900 font-bold' 
                  : 'text-gray-600'
              }`}>
                {tab.label}
              </span>
              {isActive && (
                <div className={`absolute bottom-0 left-0 right-0 h-0.5 sm:h-1 bg-gradient-to-r ${tab.color} opacity-60 rounded-full`}></div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

