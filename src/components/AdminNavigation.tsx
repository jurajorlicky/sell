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
  FaHeart
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
  { id: 'eshop-sales', label: 'Eshop', icon: FaStore, color: 'from-teal-500 to-cyan-500', path: '/admin/eshop-sales' },
  { id: 'warehouse', label: 'Warehouse', icon: FaWarehouse, color: 'from-amber-500 to-orange-500', path: '/admin/warehouse' },
  { id: 'wtb-list', label: 'WTB', icon: FaHeart, color: 'from-rose-500 to-red-500', path: '/admin/wtb-list' },
  { id: 'users', label: 'Users', icon: FaUsers, color: 'from-indigo-500 to-blue-500', path: '/admin/users' },
  { id: 'invoices', label: 'Invoices', icon: FaFileInvoice, color: 'from-pink-500 to-rose-500', path: '/admin/invoices' },
  { id: 'settings', label: 'Settings', icon: FaCog, color: 'from-gray-500 to-slate-500', path: '/admin/settings' },
  { id: 'system-status', label: 'System', icon: FaServer, color: 'from-slate-500 to-gray-700', path: '/admin/system-status' },
];

export default function AdminNavigation() {
  const location = useLocation();

  return (
    <nav className="admin-mobile-nav bg-white border border-gray-200 shadow-sm mb-4 sm:mb-6 lg:mb-8 overflow-hidden sm:rounded-2xl" aria-label="Admin navigation">
      <div className="flex justify-start overflow-x-auto admin-scrollbar" role="tablist">
        {navTabs.map((tab) => {
          const isActive = location.pathname === tab.path ||
            (tab.path !== '/admin' && location.pathname.startsWith(tab.path));
          const IconComponent = tab.icon;
          return (
            <Link
              key={tab.id}
              to={tab.path}
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex min-w-[74px] flex-col items-center justify-center gap-1 px-2 py-2.5 font-semibold transition-all duration-200 sm:min-w-max sm:flex-row sm:justify-start sm:gap-0 sm:px-3 md:px-4 lg:px-5 sm:py-3 md:py-3.5 ${
                isActive
                  ? 'bg-gray-50 text-gray-900'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              <div className={`flex-shrink-0 sm:mr-2 ${isActive ? 'text-gray-900' : 'text-gray-400'}`}>
                <IconComponent className="text-base md:text-sm" />
              </div>
              <span className={`text-[10px] leading-none sm:text-sm font-semibold ${
                isActive ? 'text-gray-900' : 'text-gray-500'
              }`}>
                {tab.label}
              </span>
              {isActive && (
                <div className={`absolute bottom-0 left-0 right-0 h-[3px] bg-gradient-to-r ${tab.color} rounded-t-full`}></div>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
