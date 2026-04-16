'use client';

import { useState } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import type { SurveyQuestion, QuestionType } from '@/types';

interface SurveyBuilderProps {
  tripId: string;
  initialQuestions?: SurveyQuestion[];
  onSave: (questions: SurveyQuestion[], title: string) => Promise<void>;
  onCancel: () => void;
}

const questionTypeConfig: Record<QuestionType, { label: string; icon: string; description: string }> = {
  single_choice: { label: 'Single Choice', icon: '○', description: 'Pick one option' },
  multiple_choice: { label: 'Multiple Choice', icon: '☐', description: 'Select multiple options' },
  ranking: { label: 'Ranking', icon: '⇅', description: 'Rank items in order' },
  scale: { label: 'Scale', icon: '━', description: 'Rate on a scale' },
  text: { label: 'Text', icon: '✎', description: 'Free text response' },
  date_range: { label: 'Date Range', icon: '📅', description: 'Select date range' },
  budget: { label: 'Budget', icon: '💰', description: 'Set budget range' },
};

const defaultQuestionsByType: Record<QuestionType, Partial<SurveyQuestion>> = {
  single_choice: { options: ['Option 1', 'Option 2', 'Option 3'] },
  multiple_choice: { options: ['Option 1', 'Option 2', 'Option 3'] },
  ranking: { options: ['Item 1', 'Item 2', 'Item 3'] },
  scale: { min: 1, max: 5, step: 1 },
  text: {},
  date_range: {},
  budget: { min: 0, max: 10000, step: 100 },
};

export function SurveyBuilder({
  tripId,
  initialQuestions = [],
  onSave,
  onCancel,
}: SurveyBuilderProps) {
  const [title, setTitle] = useState('Trip Preferences Survey');
  const [questions, setQuestions] = useState<SurveyQuestion[]>(
    initialQuestions.length > 0 ? initialQuestions : [createDefaultQuestion('single_choice')]
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);

  function createDefaultQuestion(type: QuestionType): SurveyQuestion {
    return {
      id: `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      question: '',
      required: false,
      ...defaultQuestionsByType[type],
    };
  }

  const addQuestion = (type: QuestionType) => {
    const newQuestion = createDefaultQuestion(type);
    setQuestions([...questions, newQuestion]);
    setEditingId(newQuestion.id);
    setShowAddMenu(false);
  };

  const updateQuestion = (id: string, updates: Partial<SurveyQuestion>) => {
    setQuestions(questions.map((q) => (q.id === id ? { ...q, ...updates } : q)));
  };

  const deleteQuestion = (id: string) => {
    setQuestions(questions.filter((q) => q.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const duplicateQuestion = (id: string) => {
    const question = questions.find((q) => q.id === id);
    if (!question) return;

    const newQuestion: SurveyQuestion = {
      ...question,
      id: `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      question: `${question.question} (copy)`,
    };

    const index = questions.findIndex((q) => q.id === id);
    const newQuestions = [...questions];
    newQuestions.splice(index + 1, 0, newQuestion);
    setQuestions(newQuestions);
  };

  const handleSave = async () => {
    // Validate questions
    const invalidQuestions = questions.filter(
      (q) => !q.question.trim() || (q.options && q.options.length === 0)
    );
    if (invalidQuestions.length > 0) {
      alert('Please fill in all question titles and options');
      return;
    }

    setIsSaving(true);
    try {
      await onSave(questions, title);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="text-2xl font-bold text-slate-900 dark:text-white bg-transparent border-none outline-none w-full mb-2 focus:ring-0 p-0"
          placeholder="Survey Title"
        />
        <p className="text-slate-500 dark:text-slate-400">
          Create a survey to gather preferences from your trip members
        </p>
      </div>

      {/* Questions */}
      <Reorder.Group
        axis="y"
        values={questions}
        onReorder={setQuestions}
        className="space-y-4"
      >
        <AnimatePresence>
          {questions.map((question, index) => (
            <Reorder.Item
              key={question.id}
              value={question}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -100 }}
              className="cursor-grab active:cursor-grabbing"
            >
              <QuestionEditor
                question={question}
                index={index}
                isEditing={editingId === question.id}
                onEdit={() => setEditingId(editingId === question.id ? null : question.id)}
                onUpdate={(updates) => updateQuestion(question.id, updates)}
                onDelete={() => deleteQuestion(question.id)}
                onDuplicate={() => duplicateQuestion(question.id)}
              />
            </Reorder.Item>
          ))}
        </AnimatePresence>
      </Reorder.Group>

      {/* Add Question Button */}
      <div className="relative mt-6">
        <motion.button
          onClick={() => setShowAddMenu(!showAddMenu)}
          className="w-full py-4 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl text-slate-500 dark:text-slate-400 hover:border-emerald-400 hover:text-emerald-600 dark:hover:border-emerald-600 dark:hover:text-emerald-400 transition-colors flex items-center justify-center gap-2 font-medium"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Question
        </motion.button>

        {/* Question Type Menu */}
        <AnimatePresence>
          {showAddMenu && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-2 z-10"
            >
              <div className="grid grid-cols-2 gap-2">
                {(Object.entries(questionTypeConfig) as [QuestionType, typeof questionTypeConfig[QuestionType]][]).map(
                  ([type, config]) => (
                    <button
                      key={type}
                      onClick={() => addQuestion(type)}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-left"
                    >
                      <span className="text-xl">{config.icon}</span>
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white text-sm">
                          {config.label}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {config.description}
                        </p>
                      </div>
                    </button>
                  )
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
        <button
          onClick={onCancel}
          className="px-6 py-2.5 text-slate-600 dark:text-slate-400 font-medium hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          Cancel
        </button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleSave}
          disabled={isSaving || questions.length === 0}
          className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
        >
          {isSaving ? (
            <>
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Saving...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Save Survey ({questions.length} questions)
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
}

// Question Editor Component
function QuestionEditor({
  question,
  index,
  isEditing,
  onEdit,
  onUpdate,
  onDelete,
  onDuplicate,
}: {
  question: SurveyQuestion;
  index: number;
  isEditing: boolean;
  onEdit: () => void;
  onUpdate: (updates: Partial<SurveyQuestion>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const config = questionTypeConfig[question.type];

  return (
    <motion.div
      layout
      className={`bg-white dark:bg-slate-800 rounded-xl border ${
        isEditing
          ? 'border-emerald-500 ring-2 ring-emerald-500/20'
          : 'border-slate-200 dark:border-slate-700'
      } overflow-hidden`}
    >
      {/* Question Header */}
      <div
        className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
        onClick={onEdit}
      >
        {/* Drag Handle */}
        <div className="text-slate-400 cursor-grab">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
          </svg>
        </div>

        {/* Question Number & Type */}
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold flex items-center justify-center">
            {index + 1}
          </span>
          <span className="text-sm text-slate-500 dark:text-slate-400">{config.label}</span>
        </div>

        {/* Question Text Preview */}
        <div className="flex-1 min-w-0">
          <p className="text-slate-900 dark:text-white font-medium truncate">
            {question.question || 'Untitled question'}
          </p>
        </div>

        {/* Required Badge */}
        {question.required && (
          <span className="px-2 py-0.5 text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full">
            Required
          </span>
        )}

        {/* Expand Icon */}
        <motion.svg
          animate={{ rotate: isEditing ? 180 : 0 }}
          className="w-5 h-5 text-slate-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </motion.svg>
      </div>

      {/* Expanded Editor */}
      <AnimatePresence>
        {isEditing && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4 border-t border-slate-100 dark:border-slate-700 pt-4">
              {/* Question Text */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Question
                </label>
                <input
                  type="text"
                  value={question.question}
                  onChange={(e) => onUpdate({ question: e.target.value })}
                  placeholder="Enter your question..."
                  className="w-full px-4 py-2 rounded-lg bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={question.description || ''}
                  onChange={(e) => onUpdate({ description: e.target.value })}
                  placeholder="Add a description..."
                  className="w-full px-4 py-2 rounded-lg bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                />
              </div>

              {/* Options (for choice questions) */}
              {question.options && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Options
                  </label>
                  <div className="space-y-2">
                    {question.options.map((option, optIndex) => (
                      <div key={optIndex} className="flex items-center gap-2">
                        <span className="text-slate-400">{config.icon}</span>
                        <input
                          type="text"
                          value={option}
                          onChange={(e) => {
                            const newOptions = [...question.options!];
                            newOptions[optIndex] = e.target.value;
                            onUpdate({ options: newOptions });
                          }}
                          className="flex-1 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 focus:border-emerald-500 outline-none text-sm"
                        />
                        <button
                          onClick={() => {
                            const newOptions = question.options!.filter((_, i) => i !== optIndex);
                            onUpdate({ options: newOptions });
                          }}
                          className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => onUpdate({ options: [...question.options!, ''] })}
                      className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add option
                    </button>
                  </div>
                </div>
              )}

              {/* Scale Settings */}
              {question.type === 'scale' && (
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Min</label>
                    <input
                      type="number"
                      value={question.min || 1}
                      onChange={(e) => onUpdate({ min: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Max</label>
                    <input
                      type="number"
                      value={question.max || 5}
                      onChange={(e) => onUpdate({ max: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Step</label>
                    <input
                      type="number"
                      value={question.step || 1}
                      onChange={(e) => onUpdate({ step: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-sm"
                    />
                  </div>
                </div>
              )}

              {/* Required Toggle */}
              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={question.required}
                    onChange={(e) => onUpdate({ required: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">Required</span>
                </label>

                {/* Action Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={onDuplicate}
                    className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                    title="Duplicate"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                  <button
                    onClick={onDelete}
                    className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default SurveyBuilder;
