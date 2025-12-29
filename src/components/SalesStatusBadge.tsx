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
    label: 'Accepted',
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    icon: FaCheck,
    description: 'Sale has been accepted and is waiting for label'
  },
  processing: {
    label: 'Processing',
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    icon: FaCog,
    description: 'Sale is being prepared for shipment'
  },
  shipped: {
    label: 'Shipped',
    color: 'bg-purple-100 text-purple-800 border-purple-200',
    icon: FaShippingFast,
    description: 'Product has been shipped to buyer'
  },
  delivered: {
    label: 'Delivered',
    color: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    icon: FaTruck,
    description: 'Product has been delivered to buyer'
  },
  completed: {
    label: 'Completed',
    color: 'bg-green-100 text-green-800 border-green-200',
    icon: FaCheckCircle,
    description: 'Sale is completed, payout has been paid'
  },
  cancelled: {
    label: 'Cancelled',
    color: 'bg-red-100 text-red-800 border-red-200',
    icon: FaTimes,
    description: 'Sale has been cancelled'
  },
  returned: {
    label: 'Returned',
    color: 'bg-orange-100 text-orange-800 border-orange-200',
    icon: FaUndo,
    description: 'Product has been returned'
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