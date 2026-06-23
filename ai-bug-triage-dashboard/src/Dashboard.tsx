import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Send, 
  Terminal, 
  RefreshCw, 
  HelpCircle,
  Shield,
  Activity,
  UserCheck,
  ArrowRight,
  PlusCircle,
  Flame,
  Search,
  BadgeAlert,
  Sliders
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface AIResult {
  bug_type: string;
  priority: string;
  suggested_assignee_id: string | null;
  duplicate_of: string | null;
  confidence: number;
  ai_reasoning: string | null;
}

interface BugAssignment {
  bug_id: string;
  assignee_id: string;
  assigned_at: string;
}

interface Bug {
  id: string;
  title: string;
  description: string;
  status: 'new' | 'in_progress' | 'fixed' | 'closed';
  severity: 'low' | 'medium' | 'high' | 'critical';
  component: string;
  reporter_email: string;
  created_at: string;
  ai_result: AIResult | null;
  assignment: BugAssignment | null;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  expertise: string[];
  current_load: number;
}

interface DashboardStats {
  total_bugs: number;
  by_status: {
    new: number;
    in_progress: number;
    fixed: number;
    closed: number;
  };
  by_priority: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  average_confidence: number;
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'stats' | 'bugs' | 'submit'>('bugs');
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  
  // Filtering & Selection state
  const [selectedBugId, setSelectedBugId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [componentFilter, setComponentFilter] = useState<string>('all');

  // Submit Form state
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formSteps, setFormSteps] = useState('');
  const [formEnv, setFormEnv] = useState('');
  const [formSeverity, setFormSeverity] = useState('medium');
  const [formComponent, setFormComponent] = useState('General');
  const [formEmail, setFormEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Triage state
  const [assignedTo, setAssignedTo] = useState<string>('');
  const [statusToUpdate, setStatusToUpdate] = useState<string>('');

  // AI Feedback State
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState('');
  const [feedbackSeverity, setFeedbackSeverity] = useState('');

  // Loading indicator states
  const [loadingBugs, setLoadingBugs] = useState(false);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);

  // Hardcoded hints mapping for fallback display
  const fallbackHints: Record<string, string[]> = {
    'UI Bug': [
      "Verify CSS layout rules and responsiveness on small breakpoints.",
      "Check for Javascript console errors during element rendering.",
      "Ensure that event handlers are correctly bound to the button/input elements."
    ],
    'Performance Issue': [
      "Profile database query execution plans for missing indices.",
      "Verify resource leaks or high memory usage in long-running functions.",
      "Check network payload sizes and connection pool configuration limits."
    ],
    'Crash/Error': [
      "Add proper Null Pointer guards and validate all input formats.",
      "Verify that error try-catch blocks are capturing exceptions gracefully.",
      "Check if system dependencies or external libraries are up to date."
    ],
    'Security Vulnerability': [
      "Use parameterized queries/prepared statements to prevent SQL injections.",
      "Sanitize and validate all user inputs against regex whitelists.",
      "Verify CORS origins and check session token expiration parameters."
    ],
    'Data Inconsistency': [
      "Wrap database writes in transaction blocks (Atomicity).",
      "Verify concurrent write locking mechanisms (Pessimistic/Optimistic locks)."
    ],
    'Integration Failure': [
      "Check route path parameters and verify backend mapping definitions.",
      "Ensure auth bearer headers are correctly attached to outbound calls."
    ]
  };

  const getHintsForCategory = (category: string | undefined): string[] => {
    if (!category) return ["Verify system logs and error codes.", "Confirm environmental configurations."];
    return fallbackHints[category] || [
      "Review input parameters and boundary checks.",
      "Verify data structures and object state constraints.",
      "Audit logging logs to track exceptions."
    ];
  };

  // Preset templates for automated testing
  const templates = {
    ui: {
      title: "Save Changes modal layout overlapping input field",
      description: "When opening the profile edit dialog, the modal title overlays the input box of username. The submit button is also partially hidden under the bottom boundary.",
      steps: "1. Navigate to Edit Profile\n2. Open modal on 1024x768 screen resolution\n3. Observe boundary alignment",
      env: "iOS 17, Chrome Mobile, screen width < 768px",
      severity: "low",
      component: "UI/UX"
    },
    crash: {
      title: "App crashed with OutOfMemoryError in document parsing utility",
      description: "Uploading high resolution PNG and PDF files (15MB+) results in immediate JVM crash and heap allocation exceptions in thread pool handler.",
      steps: "1. Navigate to attachments page\n2. Select 25MB report PDF\n3. Click upload\n4. Application shuts down immediately",
      env: "Production API node, JVM 17",
      severity: "critical",
      component: "Backend"
    },
    sec: {
      title: "SQL injection vulnerability in user profile search engine",
      description: "Raw SQL query concatenation observed in ProfileController search function. Sanitization function is bypassed when passing escape tags.",
      steps: "1. Open search panel\n2. Enter: ' OR '1'='1' --\n3. Verify that details of all profiles are returned",
      env: "PostgreSQL v15, Node API runtime",
      severity: "critical",
      component: "Security"
    },
    perf: {
      title: "Dashboard loading slow and causing browser rendering freeze",
      description: "Loading transactions summary list takes over 90 seconds. Thread locking spikes CPU utilization to 100% on active threads.",
      steps: "1. Load dashboard home page\n2. Click transactions tab\n3. Browser tab hangs for 90-120 seconds",
      env: "macOS 14, Safari 17.2",
      severity: "high",
      component: "Performance"
    }
  };

  const loadPresetTemplate = (type: 'ui' | 'crash' | 'sec' | 'perf') => {
    const t = templates[type];
    setFormTitle(t.title);
    setFormDesc(t.description);
    setFormSteps(t.steps);
    setFormEnv(t.env);
    setFormSeverity(t.severity);
    setFormComponent(t.component);
  };

  const fetchData = async () => {
    setLoadingBugs(true);
    setLoadingTeam(true);
    setLoadingStats(true);
    try {
      // Fetch bugs
      const bugsRes = await fetch('/api/bugs');
      if (bugsRes.ok) {
        const json = await bugsRes.json();
        setBugs(json.data || []);
      }

      // Fetch team members
      const teamRes = await fetch('/api/team-members');
      if (teamRes.ok) {
        const json = await teamRes.json();
        setTeamMembers(json.data || []);
      }

      // Fetch stats
      const statsRes = await fetch('/api/dashboard/stats');
      if (statsRes.ok) {
        const json = await statsRes.json();
        setStats(json.stats || null);
      }
    } catch (e) {
      console.error("Error loading data:", e);
    } finally {
      setLoadingBugs(false);
      setLoadingTeam(false);
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateBug = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle || !formDesc) return;
    
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/bugs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formTitle,
          description: formDesc,
          steps_to_reproduce: formSteps,
          environment: formEnv,
          severity: formSeverity,
          component: formComponent,
          reporter_email: formEmail || 'dev-sandbox@alphatech.com'
        })
      });

      if (response.ok) {
        // Confetti effect
        confetti({
          particleCount: 120,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#6366f1', '#a855f7', '#10b981', '#f59e0b']
        });

        // Reset form
        setFormTitle('');
        setFormDesc('');
        setFormSteps('');
        setFormEnv('');
        setFormSeverity('medium');
        setFormComponent('General');
        setFormEmail('');

        // Refresh and switch tab
        await fetchData();
        setActiveTab('bugs');
      } else {
        alert("Failed to submit bug report. Check backend server logs.");
      }
    } catch (error) {
      console.error(error);
      alert("Error contacting API server.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateTriage = async () => {
    if (!selectedBugId) return;

    try {
      const payload: any = {};
      if (statusToUpdate) payload.status = statusToUpdate;
      if (assignedTo) payload.assigned_to = assignedTo;

      const response = await fetch(`/api/bugs/${selectedBugId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        // Play subtle success chime or refresh
        await fetchData();
        // Clear inputs
        setAssignedTo('');
        setStatusToUpdate('');
      } else {
        alert("Failed to update bug triage details.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteBug = async (id: string) => {
    if (!confirm("Are you sure you want to permanently delete this issue from the Cloud database?")) return;
    try {
      const response = await fetch(`/api/bugs/${id}`, { method: 'DELETE' });
      if (response.ok) {
        setSelectedBugId(null);
        await fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleFeedbackSubmit = async () => {
    if (!selectedBugId) return;
    if (!feedbackCategory && !feedbackSeverity) {
      alert("Please specify a category or severity feedback correction.");
      return;
    }

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bug_id: selectedBugId,
          correct_category: feedbackCategory || undefined,
          correct_severity: feedbackSeverity || undefined
        })
      });

      if (response.ok) {
        alert("Feedback correction submitted successfully! Added to AI training feedback logs.");
        setShowFeedbackForm(false);
        setFeedbackCategory('');
        setFeedbackSeverity('');
      } else {
        alert("Failed to log feedback.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Get selected bug details
  const selectedBug = bugs.find(b => b.id === selectedBugId) || null;

  // Filter bugs based on search query and filter selections
  const filteredBugs = bugs.filter(bug => {
    const matchesSearch = 
      bug.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      bug.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (bug.ai_result?.bug_type || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || bug.status === statusFilter;
    const matchesSeverity = severityFilter === 'all' || bug.severity === severityFilter;
    const matchesComponent = componentFilter === 'all' || bug.component.toLowerCase() === componentFilter.toLowerCase();

    return matchesSearch && matchesStatus && matchesSeverity && matchesComponent;
  });

  const getSeverityColor = (sev: string | undefined) => {
    switch (sev?.toLowerCase()) {
      case 'critical': return 'bg-red-500/15 border-red-500/30 text-red-400';
      case 'high': return 'bg-orange-500/15 border-orange-500/30 text-orange-400';
      case 'medium': return 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400';
      case 'low': return 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400';
      default: return 'bg-zinc-800 border-zinc-700 text-zinc-400';
    }
  };

  const getStatusBadge = (status: string | undefined) => {
    switch (status) {
      case 'new': 
      case 'open':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 flex items-center gap-1.5 w-fit"><BadgeAlert className="w-3.5 h-3.5" /> New</span>;
      case 'in_progress': 
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center gap-1.5 w-fit"><Clock className="w-3.5 h-3.5" /> In Progress</span>;
      case 'fixed': 
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center gap-1.5 w-fit"><CheckCircle className="w-3.5 h-3.5" /> Fixed</span>;
      case 'closed': 
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-zinc-700/30 border border-zinc-600/30 text-zinc-400 flex items-center gap-1.5 w-fit"><Shield className="w-3.5 h-3.5" /> Closed</span>;
      default: 
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-zinc-800 text-zinc-400 w-fit">Unknown</span>;
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* Background Neon Glow Effects */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>

      {/* Header Navigation */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-indigo-600 to-purple-600 p-2.5 rounded-xl shadow-lg shadow-indigo-500/20">
              <Activity className="w-6 h-6 text-white animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-zinc-100 to-indigo-300 bg-clip-text text-transparent">ALPHATECH</h1>
              <p className="text-xs font-medium text-zinc-400 tracking-wider uppercase">AI Bug Triage Platform</p>
            </div>
          </div>

          <nav className="flex items-center gap-2">
            <button 
              onClick={() => setActiveTab('bugs')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${activeTab === 'bugs' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'}`}
            >
              Issue Tracker
            </button>
            <button 
              onClick={() => setActiveTab('stats')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${activeTab === 'stats' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'}`}
            >
              Dashboard Analytics
            </button>
            <button 
              onClick={() => setActiveTab('submit')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${activeTab === 'submit' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'} flex items-center gap-1.5`}
            >
              <PlusCircle className="w-4 h-4" />
              File Bug
            </button>
            <button 
              onClick={fetchData}
              title="Refresh Data"
              className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-900 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${(loadingBugs || loadingTeam || loadingStats) ? 'animate-spin text-indigo-400' : ''}`} />
            </button>
          </nav>
        </div>
      </header>

      {/* Main Body Grid */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* TAB 1: ANALYTICS */}
        {activeTab === 'stats' && (
          <div className="space-y-8 animate-fadeIn">
            {/* Stats Metric Cards Grid */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="glassmorphism p-5 rounded-2xl glow-card hover:border-zinc-700 transition-colors">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">Total Bugs</span>
                <span className="text-3xl font-extrabold block mt-2 text-white">{stats?.total_bugs || 0}</span>
                <span className="text-[10px] text-zinc-500 mt-1 block">In Cloud Database</span>
              </div>
              <div className="glassmorphism p-5 rounded-2xl glow-card hover:border-zinc-700 transition-colors border-l-2 border-l-indigo-500">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">New Issues</span>
                <span className="text-3xl font-extrabold block mt-2 text-indigo-400">{stats?.by_status.new || 0}</span>
                <span className="text-[10px] text-zinc-500 mt-1 block">Awaiting triage</span>
              </div>
              <div className="glassmorphism p-5 rounded-2xl glow-card hover:border-zinc-700 transition-colors border-l-2 border-l-amber-500">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">In Progress</span>
                <span className="text-3xl font-extrabold block mt-2 text-amber-400">{stats?.by_status.in_progress || 0}</span>
                <span className="text-[10px] text-zinc-500 mt-1 block">Currently active</span>
              </div>
              <div className="glassmorphism p-5 rounded-2xl glow-card hover:border-zinc-700 transition-colors border-l-2 border-l-emerald-500">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">Resolved</span>
                <span className="text-3xl font-extrabold block mt-2 text-emerald-400">{stats?.by_status.fixed || 0}</span>
                <span className="text-[10px] text-zinc-500 mt-1 block">Fixed issues</span>
              </div>
              <div className="glassmorphism p-5 rounded-2xl glow-card hover:border-zinc-700 transition-colors border-l-2 border-l-purple-500">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">AI Accuracy</span>
                <span className="text-3xl font-extrabold block mt-2 text-purple-400">{stats?.average_confidence || 0}%</span>
                <span className="text-[10px] text-zinc-500 mt-1 block">Avg Model Confidence</span>
              </div>
            </div>

            {/* Visual Analytics Panels */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Severity Distribution */}
              <div className="glassmorphism p-6 rounded-2xl glow-card">
                <h3 className="text-base font-bold mb-6 flex items-center gap-2 border-b border-zinc-800 pb-3"><Flame className="w-5 h-5 text-red-500" /> Severity / Priority Breakdown</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-red-400 font-medium">Critical</span>
                      <span className="font-semibold">{stats?.by_priority.critical || 0}</span>
                    </div>
                    <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                      <div className="bg-red-500 h-full" style={{ width: `${stats?.total_bugs ? ((stats.by_priority.critical / stats.total_bugs) * 100) : 0}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-orange-400 font-medium">High</span>
                      <span className="font-semibold">{stats?.by_priority.high || 0}</span>
                    </div>
                    <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                      <div className="bg-orange-500 h-full" style={{ width: `${stats?.total_bugs ? ((stats.by_priority.high / stats.total_bugs) * 100) : 0}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-yellow-400 font-medium">Medium</span>
                      <span className="font-semibold">{stats?.by_priority.medium || 0}</span>
                    </div>
                    <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                      <div className="bg-yellow-500 h-full" style={{ width: `${stats?.total_bugs ? ((stats.by_priority.medium / stats.total_bugs) * 100) : 0}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-cyan-400 font-medium">Low</span>
                      <span className="font-semibold">{stats?.by_priority.low || 0}</span>
                    </div>
                    <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                      <div className="bg-cyan-500 h-full" style={{ width: `${stats?.total_bugs ? ((stats.by_priority.low / stats.total_bugs) * 100) : 0}%` }}></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Breakdown Circle */}
              <div className="glassmorphism p-6 rounded-2xl glow-card flex flex-col justify-between">
                <div>
                  <h3 className="text-base font-bold mb-6 flex items-center gap-2 border-b border-zinc-800 pb-3"><Sliders className="w-5 h-5 text-indigo-500" /> Resolution Workflow Tracker</h3>
                  <p className="text-sm text-zinc-400 mb-6">Visual tracking of active issues against resolved issues in the Supabase Cloud database system.</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 flex items-center gap-3">
                    <div className="w-3.5 h-3.5 rounded-full bg-indigo-500"></div>
                    <div>
                      <span className="text-xs text-zinc-400 block font-medium">New</span>
                      <span className="text-lg font-bold text-white">{stats?.by_status.new || 0}</span>
                    </div>
                  </div>
                  <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 flex items-center gap-3">
                    <div className="w-3.5 h-3.5 rounded-full bg-amber-500"></div>
                    <div>
                      <span className="text-xs text-zinc-400 block font-medium">In Progress</span>
                      <span className="text-lg font-bold text-white">{stats?.by_status.in_progress || 0}</span>
                    </div>
                  </div>
                  <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 flex items-center gap-3">
                    <div className="w-3.5 h-3.5 rounded-full bg-emerald-500"></div>
                    <div>
                      <span className="text-xs text-zinc-400 block font-medium">Resolved</span>
                      <span className="text-lg font-bold text-white">{stats?.by_status.fixed || 0}</span>
                    </div>
                  </div>
                  <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 flex items-center gap-3">
                    <div className="w-3.5 h-3.5 rounded-full bg-zinc-600"></div>
                    <div>
                      <span className="text-xs text-zinc-400 block font-medium">Closed</span>
                      <span className="text-lg font-bold text-white">{stats?.by_status.closed || 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: BUG LIST & DIAGNOSTICS */}
        {activeTab === 'bugs' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-fadeIn">
            
            {/* Left 5 cols: Bug List with search & filters */}
            <div className="lg:col-span-5 space-y-4">
              
              {/* Controls block */}
              <div className="glassmorphism p-4 rounded-xl space-y-3">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
                  <input 
                    type="text" 
                    placeholder="Search bugs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-zinc-900/60 border border-zinc-800 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-white placeholder-zinc-500"
                  />
                </div>

                {/* Filters Row */}
                <div className="grid grid-cols-3 gap-2">
                  <select 
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="bg-zinc-900 border border-zinc-800 text-xs rounded-lg p-2 text-zinc-300 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="all">All Status</option>
                    <option value="new">New</option>
                    <option value="in_progress">In Progress</option>
                    <option value="fixed">Fixed</option>
                    <option value="closed">Closed</option>
                  </select>

                  <select 
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value)}
                    className="bg-zinc-900 border border-zinc-800 text-xs rounded-lg p-2 text-zinc-300 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="all">All Severity</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>

                  <select 
                    value={componentFilter}
                    onChange={(e) => setComponentFilter(e.target.value)}
                    className="bg-zinc-900 border border-zinc-800 text-xs rounded-lg p-2 text-zinc-300 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="all">All Components</option>
                    <option value="ui/ux">UI/UX</option>
                    <option value="backend">Backend</option>
                    <option value="database">Database</option>
                    <option value="security">Security</option>
                    <option value="performance">Performance</option>
                    <option value="General">General</option>
                  </select>
                </div>
              </div>

              {/* Scrollable bug items list */}
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                {loadingBugs ? (
                  <div className="text-center py-12 text-zinc-500 text-sm">Loading bugs from Supabase...</div>
                ) : filteredBugs.length === 0 ? (
                  <div className="text-center py-12 text-zinc-500 text-sm border border-dashed border-zinc-800 rounded-xl">No bugs match search parameters.</div>
                ) : (
                  filteredBugs.map(bug => (
                    <button
                      key={bug.id}
                      onClick={() => setSelectedBugId(bug.id)}
                      className={`w-full text-left p-4 rounded-xl border transition-all duration-200 flex flex-col gap-2 ${selectedBugId === bug.id ? 'bg-indigo-500/10 border-indigo-500/80 shadow-md shadow-indigo-500/5' : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/60'}`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-sm font-bold text-white line-clamp-1 flex-1">{bug.title}</span>
                        <span className={`px-2 py-0.5 text-[10px] font-bold tracking-wider rounded border uppercase flex-shrink-0 ${getSeverityColor(bug.severity)}`}>
                          {bug.severity}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 line-clamp-2">{bug.description}</p>
                      
                      <div className="flex items-center justify-between mt-1 pt-2 border-t border-zinc-800/60 text-[10px] text-zinc-500 font-medium">
                        <div className="flex items-center gap-2">
                          <span className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">{bug.component}</span>
                          {bug.ai_result?.bug_type && (
                            <span className="bg-purple-950/40 text-purple-400 border border-purple-500/20 px-1.5 py-0.5 rounded font-semibold">AI: {bug.ai_result.bug_type}</span>
                          )}
                        </div>
                        <span className="text-zinc-500">{new Date(bug.created_at).toLocaleDateString()}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Right 7 cols: Detailed diagnostics & Triage action panel */}
            <div className="lg:col-span-7">
              {selectedBug ? (
                <div className="space-y-6 animate-fadeIn">
                  
                  {/* Card 1: Bug Details */}
                  <div className="glassmorphism p-6 rounded-2xl glow-card space-y-4">
                    <div className="flex justify-between items-start gap-4 border-b border-zinc-800/80 pb-4">
                      <div>
                        {getStatusBadge(selectedBug.status)}
                        <h2 className="text-lg font-bold text-white mt-2 leading-snug">{selectedBug.title}</h2>
                        <span className="text-[10px] text-zinc-500 font-mono mt-1 block">ID: {selectedBug.id}</span>
                      </div>
                      <button 
                        onClick={() => handleDeleteBug(selectedBug.id)}
                        className="text-xs text-red-400 hover:text-red-300 px-2.5 py-1 rounded bg-red-950/40 border border-red-500/20 font-semibold transition-colors"
                      >
                        Delete
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">Description</span>
                        <p className="text-sm text-zinc-300 mt-1 whitespace-pre-wrap leading-relaxed">{selectedBug.description}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-xs mt-3 pt-3 border-t border-zinc-800/40">
                        <div>
                          <span className="text-zinc-500 block">Reporter</span>
                          <span className="font-semibold text-zinc-300">{selectedBug.reporter_email}</span>
                        </div>
                        <div>
                          <span className="text-zinc-500 block">Created On</span>
                          <span className="font-semibold text-zinc-300">{new Date(selectedBug.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: AI Classification & Diagnostic Results */}
                  <div className="glassmorphism p-6 rounded-2xl border-l-2 border-l-purple-500 glow-card space-y-5">
                    <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-3">
                      <Terminal className="w-5 h-5 text-purple-400" />
                      <h3 className="text-base font-bold text-purple-400">AI Diagnostics & Inference</h3>
                    </div>

                    {selectedBug.ai_result ? (
                      <div className="space-y-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          
                          {/* Predicted Category */}
                          <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800/80">
                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Predicted Category</span>
                            <span className="text-base font-bold text-white block mt-1">{selectedBug.ai_result.bug_type}</span>
                            
                            <div className="mt-3">
                              <div className="flex justify-between text-[10px] mb-1 font-semibold">
                                <span className="text-zinc-500">Model Confidence</span>
                                <span className="text-purple-400">{selectedBug.ai_result.confidence}%</span>
                              </div>
                              <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                                <div className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full rounded-full" style={{ width: `${selectedBug.ai_result.confidence}%` }}></div>
                              </div>
                            </div>
                          </div>

                          {/* Severity Recommendation */}
                          <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800/80 flex flex-col justify-between">
                            <div>
                              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Severity Prediction</span>
                              <span className={`px-2 py-0.5 text-xs font-bold uppercase rounded border inline-block mt-2 ${getSeverityColor(selectedBug.ai_result.priority)}`}>
                                {selectedBug.ai_result.priority}
                              </span>
                            </div>
                            {selectedBug.ai_result.suggested_assignee_id && (
                              <div className="mt-2 text-[10px] text-zinc-400 flex items-center gap-1">
                                <UserCheck className="w-3.5 h-3.5 text-purple-400" />
                                <span>Suggested Assignee Matched</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Reasoning */}
                        {selectedBug.ai_result.ai_reasoning && (
                          <div className="bg-zinc-900/30 p-3 rounded-lg border border-zinc-800/40 text-xs">
                            <span className="text-zinc-500 block font-semibold">Model Reasoning Summary:</span>
                            <p className="text-zinc-300 mt-1 italic">"{selectedBug.ai_result.ai_reasoning}"</p>
                          </div>
                        )}

                        {/* Actionable Hints */}
                        <div className="space-y-2">
                          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">Root Cause Diagnostic Hints</span>
                          <ul className="space-y-2">
                            {getHintsForCategory(selectedBug.ai_result.bug_type).map((hint, idx) => (
                              <li key={idx} className="flex gap-2.5 text-xs bg-zinc-900/40 border border-zinc-850 p-3 rounded-lg text-zinc-300">
                                <span className="text-emerald-400 font-bold">✓</span>
                                <div>{hint}</div>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Potential Duplicate Detections */}
                        <div className="space-y-2">
                          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">Potential Duplicate Reports</span>
                          {selectedBug.ai_result.duplicate_of ? (
                            <div className="p-3 bg-red-950/20 border border-red-500/20 text-xs rounded-xl flex items-center justify-between">
                              <div className="flex items-center gap-2 text-red-400">
                                <AlertTriangle className="w-4 h-4" />
                                <div>
                                  <span className="font-semibold block">Duplicate Issue Identified</span>
                                  <span className="text-[10px] text-zinc-500">Linked to UUID: {selectedBug.ai_result.duplicate_of}</span>
                                </div>
                              </div>
                              <button 
                                onClick={() => setSelectedBugId(selectedBug.ai_result!.duplicate_of)}
                                className="text-xs text-indigo-400 hover:underline flex items-center gap-1 font-semibold"
                              >
                                View Original <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <p className="text-xs text-zinc-500 italic">No duplicate submissions detected in the live database records.</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6 text-zinc-500 text-xs italic">AI result not computed or not linked for this bug.</div>
                    )}

                    {/* Feedback loop trigger button */}
                    <div className="flex justify-end pt-2">
                      <button 
                        onClick={() => setShowFeedbackForm(!showFeedbackForm)}
                        className="text-[10px] text-zinc-500 hover:text-indigo-400 underline font-medium"
                      >
                        {showFeedbackForm ? "Cancel Feedback" : "Incorrect Prediction? Log Correction Feedback"}
                      </button>
                    </div>

                    {showFeedbackForm && (
                      <div className="p-4 bg-zinc-900/80 border border-zinc-800 rounded-xl space-y-3 animate-fadeIn">
                        <span className="text-xs font-bold text-white block">Log Reinforcement Correction</span>
                        <div className="grid grid-cols-2 gap-2">
                          <select 
                            value={feedbackCategory}
                            onChange={(e) => setFeedbackCategory(e.target.value)}
                            className="bg-zinc-950 border border-zinc-800 text-xs rounded p-2 text-zinc-300 focus:outline-none"
                          >
                            <option value="">-- Adjust Category --</option>
                            <option value="UI Bug">UI Bug</option>
                            <option value="Performance Issue">Performance Issue</option>
                            <option value="Crash/Error">Crash/Error</option>
                            <option value="Security Vulnerability">Security Vulnerability</option>
                            <option value="Feature Request">Feature Request</option>
                            <option value="Integration Failure">Integration Failure</option>
                            <option value="Configuration Error">Configuration Error</option>
                            <option value="Data Inconsistency">Data Inconsistency</option>
                          </select>
                          <select 
                            value={feedbackSeverity}
                            onChange={(e) => setFeedbackSeverity(e.target.value)}
                            className="bg-zinc-950 border border-zinc-800 text-xs rounded p-2 text-zinc-300 focus:outline-none"
                          >
                            <option value="">-- Adjust Severity --</option>
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="critical">Critical</option>
                          </select>
                        </div>
                        <button 
                          onClick={handleFeedbackSubmit}
                          className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-bold transition-all"
                        >
                          Submit Feedback
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Card 3: Triage Actions & Assignment */}
                  <div className="glassmorphism p-6 rounded-2xl glow-card space-y-4">
                    <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-zinc-800/80 pb-3">
                      <Sliders className="w-5 h-5 text-indigo-400" />
                      Triage & Assignment Panel
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Assignee Selection */}
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">Assign Team Member</label>
                        <select 
                          value={assignedTo}
                          onChange={(e) => setAssignedTo(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 text-sm rounded-lg p-2.5 text-zinc-100 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="">-- Select Member --</option>
                          {teamMembers.map(member => {
                            const isSuggested = selectedBug.ai_result?.suggested_assignee_id === member.id;
                            return (
                              <option key={member.id} value={member.id}>
                                {member.name} ({member.expertise.slice(0, 2).join(', ')}) {isSuggested ? '★ AI Recommended' : ''}
                              </option>
                            );
                          })}
                        </select>
                        {selectedBug.ai_result?.suggested_assignee_id && (
                          <div className="bg-purple-950/20 border border-purple-500/20 rounded-lg p-2.5 text-[10px] text-purple-400 font-semibold flex items-center gap-1.5">
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>AI recommends assigning this to: <b>{teamMembers.find(m => m.id === selectedBug.ai_result?.suggested_assignee_id)?.name || 'Matching expert'}</b></span>
                          </div>
                        )}
                      </div>

                      {/* Status Update Selection */}
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">Transition Status</label>
                        <select 
                          value={statusToUpdate}
                          onChange={(e) => setStatusToUpdate(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 text-sm rounded-lg p-2.5 text-zinc-100 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="">-- Select Status --</option>
                          <option value="new">New / Triage</option>
                          <option value="in_progress">In Progress</option>
                          <option value="fixed">Fixed / Resolved</option>
                          <option value="closed">Closed</option>
                        </select>
                      </div>
                    </div>

                    <button 
                      onClick={handleUpdateTriage}
                      disabled={!assignedTo && !statusToUpdate}
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold shadow-lg shadow-indigo-500/10 transition-all flex justify-center items-center gap-2"
                    >
                      <CheckCircle className="w-4 h-4" /> Save Triage Changes
                    </button>

                    {/* Show current assignment */}
                    {selectedBug.assignment && (
                      <div className="bg-zinc-900/40 p-3 rounded-lg border border-zinc-800/60 text-xs flex justify-between items-center text-zinc-400 mt-2">
                        <span>Assigned to: <b>{teamMembers.find(m => m.id === selectedBug.assignment?.assignee_id)?.name || 'Teammate'}</b></span>
                        <span>Assigned: {new Date(selectedBug.assignment.assigned_at).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>

                </div>
              ) : (
                <div className="glassmorphism p-12 rounded-2xl glow-card text-center text-zinc-500 flex flex-col justify-center items-center min-h-[350px]">
                  <HelpCircle className="w-12 h-12 text-zinc-600 mb-4 animate-bounce" />
                  <h3 className="text-base font-bold text-white mb-2">No Bug Selected</h3>
                  <p className="text-sm max-w-sm">Select an active issue from the left issue tracker list to review diagnostics, suggested assignees, duplicate alerts, and apply triage updates.</p>
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB 3: FILE BUG REPORT */}
        {activeTab === 'submit' && (
          <div className="max-w-2xl mx-auto glassmorphism p-8 rounded-2xl glow-card space-y-6 animate-fadeIn">
            <div className="border-b border-zinc-800/80 pb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2"><PlusCircle className="w-6 h-6 text-indigo-400" /> File Bug Report</h2>
              <p className="text-xs text-zinc-400 mt-1">Submit a detailed bug description. The AI classifier will automatically categorize, predict severity, matching expert, and flag duplicates in the database.</p>
            </div>

            {/* Quick preset templates */}
            <div className="space-y-2 bg-zinc-900/60 p-4 rounded-xl border border-zinc-800/60">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Load Automated Test Template</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button type="button" onClick={() => loadPresetTemplate('ui')} className="py-1.5 px-2 bg-zinc-950 border border-zinc-850 hover:border-zinc-700 hover:text-white rounded text-[11px] text-zinc-400 text-left truncate">🎨 UI Overlap</button>
                <button type="button" onClick={() => loadPresetTemplate('crash')} className="py-1.5 px-2 bg-zinc-950 border border-zinc-850 hover:border-zinc-700 hover:text-white rounded text-[11px] text-zinc-400 text-left truncate">💥 Heap Crash</button>
                <button type="button" onClick={() => loadPresetTemplate('sec')} className="py-1.5 px-2 bg-zinc-950 border border-zinc-850 hover:border-zinc-700 hover:text-white rounded text-[11px] text-zinc-400 text-left truncate">🔑 SQL Injection</button>
                <button type="button" onClick={() => loadPresetTemplate('perf')} className="py-1.5 px-2 bg-zinc-950 border border-zinc-850 hover:border-zinc-700 hover:text-white rounded text-[11px] text-zinc-400 text-left truncate">⚡ Slow Delay</button>
              </div>
            </div>

            <form onSubmit={handleCreateBug} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-300 block">Bug Title / Short Summary *</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Navigation dropdown overlaps sidebar elements"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-white placeholder-zinc-600"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-300 block">Detailed Description *</label>
                <textarea 
                  required
                  rows={4}
                  placeholder="Describe the unexpected behavior and what the system should do..."
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-white placeholder-zinc-650"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-300 block">Steps to Reproduce</label>
                  <textarea 
                    rows={3}
                    placeholder="1. Log in to dashboard&#10;2. Click profile settings..."
                    value={formSteps}
                    onChange={(e) => setFormSteps(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-sm focus:outline-none focus:border-indigo-500 text-white placeholder-zinc-650"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-300 block">Environment Details</label>
                  <textarea 
                    rows={3}
                    placeholder="e.g. Windows 11, Chrome v122, production-v3.2"
                    value={formEnv}
                    onChange={(e) => setFormEnv(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-sm focus:outline-none focus:border-indigo-500 text-white placeholder-zinc-650"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-300 block">Reported Component / Area</label>
                  <select 
                    value={formComponent}
                    onChange={(e) => setFormComponent(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="General">General</option>
                    <option value="UI/UX">UI/UX Layout</option>
                    <option value="Backend">Backend Service</option>
                    <option value="Database">Database Query</option>
                    <option value="Security">Security Access</option>
                    <option value="Performance">Performance Speed</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-300 block">User-Specified Severity</label>
                  <select 
                    value={formSeverity}
                    onChange={(e) => setFormSeverity(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="low">Low (Cosmetic/Minor)</option>
                    <option value="medium">Medium (Standard Bug)</option>
                    <option value="high">High (Broken functionality)</option>
                    <option value="critical">Critical (Crash / Data risk)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-300 block">Your Email (Reporter) *</label>
                <input 
                  type="email" 
                  required
                  placeholder="you@company.com"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-white placeholder-zinc-600"
                />
              </div>

              <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full mt-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all flex justify-center items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Analyzing Report Parameters...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" /> Submit Report & Run AI Triage
                  </>
                )}
              </button>
            </form>
          </div>
        )}

      </main>

      {/* Footer Status */}
      <footer className="border-t border-zinc-900 bg-zinc-950 py-4 text-center text-[10px] text-zinc-600 font-medium tracking-wider">
        ALPHA_TECH SYSTEM INFRASTRUCTURE © 2026. ALL DATABASE CONNECTIONS STABLE.
      </footer>
    </div>
  );
}
