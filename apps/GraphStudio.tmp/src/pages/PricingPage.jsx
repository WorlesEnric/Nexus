import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, Zap, Rocket, Crown, ArrowLeft } from 'lucide-react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

const PlanCard = ({ title, price, description, features, icon: Icon, color, popular, onSelect }) => (
    <motion.div
        whileHover={{ y: -5 }}
        className={`relative bg-zinc-900/50 backdrop-blur-xl border ${popular ? `border-${color}-500` : 'border-zinc-800'} rounded-2xl p-8 flex flex-col`}
    >
        {popular && (
            <div className={`absolute -top-4 left-1/2 -translate-x-1/2 bg-${color}-500 text-black text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider`}>
                Most Popular
            </div>
        )}

        <div className={`w-12 h-12 rounded-xl bg-${color}-500/20 flex items-center justify-center mb-6`}>
            <Icon className={`w-6 h-6 text-${color}-400`} />
        </div>

        <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
        <div className="flex items-baseline gap-1 mb-4">
            <span className="text-4xl font-bold text-white">${price}</span>
            <span className="text-zinc-500">/month</span>
        </div>
        <p className="text-zinc-400 mb-8">{description}</p>

        <div className="space-y-4 mb-8 flex-1">
            {features.map((feature, i) => (
                <div key={i} className="flex items-center gap-3">
                    <Check className={`w-5 h-5 text-${color}-400`} />
                    <span className="text-zinc-300 text-sm">{feature}</span>
                </div>
            ))}
        </div>

        <button
            onClick={onSelect}
            className={`w-full py-3 rounded-xl font-bold transition-all ${popular
                    ? `bg-${color}-500 hover:bg-${color}-400 text-black`
                    : 'bg-zinc-800 hover:bg-zinc-700 text-white'
                }`}
        >
            Select Plan
        </button>
    </motion.div>
);

export default function PricingPage() {
    const { user } = useAuth();

    const handleSelect = async (plan) => {
        if (!user) return;
        try {
            await client.post('/subscription/upgrade', null, { params: { plan: plan.toLowerCase() } });
            alert(`Upgraded to ${plan}!`);
        } catch (e) {
            console.error(e);
            alert("Upgrade failed");
        }
    }

    const plans = [
        {
            title: "Free",
            price: 0,
            description: "Perfect for hobbyists and students",
            features: ["3 Projects", "Community Support", "Basic Access"],
            icon: Zap,
            color: "blue",
            popular: false
        },
        {
            title: "Pro",
            price: 19,
            description: "For professional developers",
            features: ["Unlimited Projects", "Priority Support", "Advanced AI Features", "Collaboration"],
            icon: Rocket,
            color: "purple",
            popular: true
        },
        {
            title: "Enterprise",
            price: 99,
            description: "For large teams and organizations",
            features: ["Custom Infrastructure", "Dedicated Support", "SLA", "Audit Logs", "SSO"],
            icon: Crown,
            color: "amber",
            popular: false
        }
    ];

    return (
        <div className="min-h-screen bg-[#0a0a0c] text-white p-6 relative overflow-hidden">
            {/* Background Gradients */}
            <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-purple-900/10 rounded-full blur-[120px]" />

            <div className="max-w-7xl mx-auto relative z-10">
                <header className="flex justify-between items-center mb-16">
                    <Link to="/" className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                        Back to Hub
                    </Link>
                </header>

                <div className="text-center max-w-2xl mx-auto mb-20">
                    <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-amber-400 bg-clip-text text-transparent mb-6">
                        Choose Your Power
                    </h1>
                    <p className="text-xl text-zinc-400">
                        Unlock the full potential of Nexus with our flexible pricing plans designed for every stage of your journey.
                    </p>
                </div>

                <div className="grid md:grid-cols-3 gap-8">
                    {plans.map((plan, i) => (
                        <PlanCard
                            key={i}
                            {...plan}
                            onSelect={() => handleSelect(plan.title)}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
