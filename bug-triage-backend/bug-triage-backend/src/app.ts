import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Supabase connection
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SECRET_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(cors());
app.use(express.json());

// Heuristic rule-based fallback if Python AI service is down
async function classifyBugHeuristic(title: string, description: string) {
  const text = `${title} ${description}`.toLowerCase();
  
  // Determine priority
  let priority = 'medium';
  if (text.includes('crash') || text.includes('security') || text.includes('data loss') || text.includes('urgent')) {
    priority = 'critical';
  } else if (text.includes('error') || text.includes('broken') || text.includes('not working') || text.includes('failed')) {
    priority = 'high';
  } else if (text.includes('typo') || text.includes('cosmetic') || text.includes('spacing')) {
    priority = 'low';
  }
  
  // Determine bug type
  let bugType = 'General';
  if (text.includes('button') || text.includes('click') || text.includes('ui') || text.includes('frontend') || text.includes('display')) {
    bugType = 'UI Bug';
  } else if (text.includes('api') || text.includes('endpoint') || text.includes('server') || text.includes('backend')) {
    bugType = 'Integration Failure';
  } else if (text.includes('database') || text.includes('query') || text.includes('sql') || text.includes('postgres')) {
    bugType = 'Data Inconsistency';
  } else if (text.includes('security') || text.includes('auth') || text.includes('password') || text.includes('login')) {
    bugType = 'Security Vulnerability';
  } else if (text.includes('slow') || text.includes('performance') || text.includes('timeout')) {
    bugType = 'Performance Issue';
  }
  
  // Calculate confidence
  let confidence = 70;
  if (priority === 'critical') confidence = 90;
  else if (priority === 'high') confidence = 85;
  else if (text.length > 100) confidence = 80;
  
  return {
    bug_type: bugType,
    priority: priority,
    confidence: confidence,
    reasoning: `Classified as ${bugType} issue with ${priority} priority.`
  };
}

// ==================== API ROUTES ====================

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    server: 'running',
    timestamp: new Date().toISOString()
  });
});

// Get all bugs (merged with AI results and assignments)
app.get('/api/bugs', async (req, res) => {
  try {
    const { data: bugs, error: bugsError } = await supabase
      .from('bugs')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (bugsError) throw bugsError;
    
    const { data: aiResults } = await supabase.from('ai_results').select('*');
    const { data: assignments } = await supabase.from('bug_assignments').select('*');
    
    const mergedBugs = (bugs || []).map(bug => {
      const aiResult = (aiResults || []).find(a => a.bug_id === bug.id);
      const assignment = (assignments || []).find(a => a.bug_id === bug.id);
      return {
        ...bug,
        ai_result: aiResult || null,
        assignment: assignment || null
      };
    });
    
    res.json({ 
      success: true, 
      count: mergedBugs.length, 
      data: mergedBugs 
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single bug with AI results & assignment
app.get('/api/bugs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get bug
    const { data: bug, error: bugError } = await supabase
      .from('bugs')
      .select('*')
      .eq('id', id)
      .single();
    
    if (bugError) throw bugError;
    
    // Get AI results
    const { data: aiResult } = await supabase
      .from('ai_results')
      .select('*')
      .eq('bug_id', id)
      .single();
    
    // Get bug assignment
    const { data: assignment } = await supabase
      .from('bug_assignments')
      .select('*')
      .eq('bug_id', id)
      .single();
    
    res.json({ 
      success: true, 
      data: { ...bug, ai_result: aiResult, assignment: assignment } 
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new bug with real AI classification from Python service
app.post('/api/bugs', async (req, res) => {
  try {
    const { title, description, steps_to_reproduce, environment, severity, component, reporter_email } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({ 
        success: false, 
        error: 'Title and description are required' 
      });
    }

    // Save steps and env inside the description if they are provided to preserve them in the DB
    let fullDescription = description;
    if (steps_to_reproduce) {
      fullDescription += `\n\n[Steps to Reproduce]\n${steps_to_reproduce}`;
    }
    if (environment) {
      fullDescription += `\n\n[Environment]\n${environment}`;
    }
    
    // 1. Insert the bug into cloud DB
    const { data: bug, error: bugError } = await supabase
      .from('bugs')
      .insert([{
        title,
        description: fullDescription,
        status: 'new',
        severity: severity || 'medium',
        component: component || 'General',
        reporter_email: reporter_email || 'system@alphatech.com'
      }])
      .select()
      .single();
    
    if (bugError) throw bugError;
    
    // 2. Call the Python AI classifier service
    let classification: {
      bug_type: string;
      priority: string;
      confidence: number;
      reasoning: string;
      duplicate_of: string | null;
    };

    try {
      const aiResponse = await fetch('http://127.0.0.1:8000/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          steps_to_reproduce: steps_to_reproduce || null,
          environment: environment || null
        })
      });

      if (aiResponse.ok) {
        const aiData = await aiResponse.json() as any;
        
        let duplicateOfId: string | null = null;
        if (aiData.potential_duplicates && aiData.potential_duplicates.length > 0) {
          const topCandidate = aiData.potential_duplicates[0];
          // If match score is high and it looks like a UUID (implies it's a live database bug duplicate)
          if (topCandidate.similarity_score >= 0.70 && topCandidate.bug_id.includes('-')) {
            duplicateOfId = topCandidate.bug_id;
          }
        }

        classification = {
          bug_type: aiData.category,
          priority: aiData.severity_prediction.toLowerCase(),
          confidence: Math.round(aiData.confidence_score * 100),
          reasoning: `Classified as ${aiData.category} with ${aiData.severity_prediction} severity. Hints: ${aiData.root_cause_hints.slice(0, 2).join(', ')}`,
          duplicate_of: duplicateOfId
        };
      } else {
        throw new Error(`AI service returned status ${aiResponse.status}`);
      }
    } catch (aiErr) {
      console.warn('AI classification failed, using heuristic fallback:', aiErr);
      const fallback = await classifyBugHeuristic(title, description);
      classification = {
        bug_type: fallback.bug_type,
        priority: fallback.priority,
        confidence: fallback.confidence,
        reasoning: fallback.reasoning + " (Fallback Heuristic)",
        duplicate_of: null
      };
    }

    // 3. Match Suggested Assignee from team_members based on bug_type expertise
    let suggestedAssigneeId: string | null = null;
    try {
      const { data: teamMembers } = await supabase.from('team_members').select('*');
      if (teamMembers && teamMembers.length > 0) {
        const typeLower = classification.bug_type.toLowerCase();
        let keyword = 'backend'; // Default search keyword

        if (typeLower.includes('ui') || typeLower.includes('cosmetic') || typeLower.includes('frontend')) {
          keyword = 'frontend';
        } else if (typeLower.includes('database') || typeLower.includes('data') || typeLower.includes('sql') || typeLower.includes('inconsistency')) {
          keyword = 'database';
        } else if (typeLower.includes('security') || typeLower.includes('auth') || typeLower.includes('ai') || typeLower.includes('ml')) {
          keyword = 'ai';
        }

        const matchedMember = teamMembers.find(m => 
          m.expertise && m.expertise.some((exp: string) => exp.toLowerCase().includes(keyword))
        );

        if (matchedMember) {
          suggestedAssigneeId = matchedMember.id;
        } else {
          suggestedAssigneeId = teamMembers[0].id;
        }
      }
    } catch (teamErr) {
      console.error('Error matching assignee:', teamErr);
    }
    
    // 4. Store AI results in cloud DB
    const { error: aiError } = await supabase
      .from('ai_results')
      .insert([{
        bug_id: bug.id,
        bug_type: classification.bug_type,
        priority: classification.priority,
        suggested_assignee_id: suggestedAssigneeId,
        duplicate_of: classification.duplicate_of,
        confidence: classification.confidence,
        ai_reasoning: classification.reasoning
      }]);
    
    if (aiError) throw aiError;
    
    res.status(201).json({
      success: true,
      data: bug,
      classification: {
        bug_type: classification.bug_type,
        priority: classification.priority,
        confidence: classification.confidence,
        reasoning: classification.reasoning,
        suggested_assignee_id: suggestedAssigneeId,
        duplicate_of: classification.duplicate_of
      }
    });
    
  } catch (error: any) {
    console.error('Error creating bug:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update bug status and assignees cleanly
app.put('/api/bugs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, assigned_to } = req.body;
    
    const updates: any = {};
    if (status) updates.status = status;
    
    // Only update bug table status
    let bugData = null;
    if (status) {
      const { data, error } = await supabase
        .from('bugs')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      bugData = data;
    }
    
    // Handle assignee update in bug_assignments table (join table matches schema)
    if (assigned_to) {
      const { data: existingAssignment } = await supabase
        .from('bug_assignments')
        .select('*')
        .eq('bug_id', id);

      if (existingAssignment && existingAssignment.length > 0) {
        const { error: assignError } = await supabase
          .from('bug_assignments')
          .update({ assignee_id: assigned_to, assigned_at: new Date().toISOString() })
          .eq('bug_id', id);
        if (assignError) throw assignError;
      } else {
        const { error: assignError } = await supabase
          .from('bug_assignments')
          .insert([{ bug_id: id, assignee_id: assigned_to, assigned_at: new Date().toISOString() }]);
        if (assignError) throw assignError;
      }
    }
    
    res.json({ success: true, data: bugData });
  } catch (error: any) {
    console.error('Error updating bug:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete bug
app.delete('/api/bugs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Delete AI results first
    await supabase.from('ai_results').delete().eq('bug_id', id);
    
    // Delete bug assignments
    await supabase.from('bug_assignments').delete().eq('bug_id', id);
    
    // Delete bug
    const { error } = await supabase.from('bugs').delete().eq('id', id);
    
    if (error) throw error;
    
    res.json({ success: true, message: 'Bug deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get team members
app.get('/api/team-members', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('team_members')
      .select('*')
      .order('name');
    
    if (error) throw error;
    
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Forward AI Feedback Corrections to Python AI Service log
app.post('/api/feedback', async (req, res) => {
  try {
    const { bug_id, correct_category, correct_severity } = req.body;
    
    const aiResponse = await fetch('http://127.0.0.1:8000/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bug_id, correct_category, correct_severity })
    });
    
    if (aiResponse.ok) {
      res.json({ success: true, message: 'Feedback submitted to AI service.' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to submit feedback to AI service.' });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Dashboard statistics
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    // Get all bugs
    const { data: bugs } = await supabase.from('bugs').select('*');
    
    // Get AI results
    const { data: aiResults } = await supabase.from('ai_results').select('*');
    
    const stats = {
      total_bugs: bugs?.length || 0,
      by_status: {
        new: bugs?.filter(b => b.status === 'new' || b.status === 'open').length || 0,
        in_progress: bugs?.filter(b => b.status === 'in_progress').length || 0,
        fixed: bugs?.filter(b => b.status === 'fixed').length || 0,
        closed: bugs?.filter(b => b.status === 'closed').length || 0
      },
      by_priority: {
        critical: aiResults?.filter(a => a.priority === 'critical').length || 0,
        high: aiResults?.filter(a => a.priority === 'high').length || 0,
        medium: aiResults?.filter(a => a.priority === 'medium').length || 0,
        low: aiResults?.filter(a => a.priority === 'low').length || 0
      },
      average_confidence: Math.round(
        aiResults && aiResults.length > 0
          ? aiResults.reduce((acc, curr) => acc + (curr.confidence || 0), 0) / aiResults.length
          : 0
      )
    };
    
    res.json({ success: true, stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Bug Triage Server running on http://localhost:${PORT}`);
  console.log(`📊 Connected to Supabase`);
  console.log(`\n📌 Available Endpoints:`);
  console.log(`   GET    /api/bugs           - List all bugs`);
  console.log(`   POST   /api/bugs           - Create new bug (auto-classified)`);
  console.log(`   GET    /api/bugs/:id       - Get bug details`);
  console.log(`   PUT    /api/bugs/:id       - Update bug`);
  console.log(`   DELETE /api/bugs/:id       - Delete bug`);
  console.log(`   GET    /api/team-members   - List team members`);
  console.log(`   GET    /api/dashboard/stats- Dashboard stats`);
  console.log(`   POST   /api/feedback       - Submit triage corrections`);
  console.log(`   GET    /health             - Health check`);
});