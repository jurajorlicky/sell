import React from 'react';
import { 
  FaCheck, 
  FaCog, 
  FaShippingFast, 
  FaTruck, 
  FaCheckCircle, 
  FaTimes,
  FaUndo
} from 'react-icons/fa';

interface SalesStatusBadgeProps {
  status: string;
  className?: string;
}

const statusConfig = {
  accepted: {
    label: 'Prijatý',
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    icon: FaCheck,
    description: 'Predaj bol prijatý a čaká na label'
  },
  processing: {
    label: 'Label odoslaný',
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    icon: FaCog,
    description: 'Predaj sa pripravuje na odoslanie'
  },
  shipped: {
    label: 'Odoslaný',
    color: 'bg-purple-100 text-purple-800 border-purple-200',
    icon: FaShippingFast,
    description: 'Produkt bol odoslaný kupujúcemu'
  },
  delivered: {
    label: 'Doručený',
    color: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    icon: FaTruck,
    description: 'Produkt bol doručený kupujúcemu'
  },
  completed: {
    label: 'Dokončený',
    color: 'bg-green-100 text-green-800 border-green-200',
    icon: FaCheckCircle,
    description: 'Predaj je dokončený, payout vyplatený'
  },
  cancelled: {
    label: 'Zrušený',
    color: 'bg-red-100 text-red-800 border-red-200',
    icon: FaTimes,
    description: 'Predaj bol zrušený'
  },
  returned: {
    label: 'Vrátený',
    color: 'bg-orange-100 text-orange-800 border-orange-200',
    icon: FaUndo,
    description: 'Produkt bol vrátený'
  }
};

export default function SalesStatusBadge({ status, className = '' }: SalesStatusBadgeProps) {
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.accepted;
  const Icon = config.icon;

  return (
    <span 
      className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${config.color} ${className}`}
      title={config.description}
    >
      <Icon className="mr-2 text-xs" />
      {config.label}
    </span>
  );
}