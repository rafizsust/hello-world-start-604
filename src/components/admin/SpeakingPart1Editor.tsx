import { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { RichTextEditor } from './RichTextEditor';
import { SpeakingQuestionAudioEditor } from './SpeakingQuestionAudioEditor';

export interface SpeakingQuestion {
  id?: string;
  question_number: number;
  question_text: string;
  order_index: number;
  audio_url?: string | null; // Optional audio URL for examiner audio
}

interface SpeakingPart1EditorProps {
  questions: SpeakingQuestion[];
  onUpdateQuestions: (questions: SpeakingQuestion[]) => void;
}

export function SpeakingPart1Editor({
  questions,
  onUpdateQuestions,
}: SpeakingPart1EditorProps) {
  const addQuestion = useCallback(() => {
    const newOrderIndex = questions.length;
    const newQuestion: SpeakingQuestion = {
      id: crypto.randomUUID(),
      question_number: newOrderIndex + 1,
      question_text: '',
      order_index: newOrderIndex,
      audio_url: null,
    };
    onUpdateQuestions([...questions, newQuestion]);
  }, [questions, onUpdateQuestions]);

  const updateQuestion = useCallback((index: number, updates: Partial<SpeakingQuestion>) => {
    const newQuestions = [...questions];
    newQuestions[index] = { ...newQuestions[index], ...updates };
    onUpdateQuestions(newQuestions);
  }, [questions, onUpdateQuestions]);

  const removeQuestion = useCallback((index: number) => {
    const newQuestions = questions
      .filter((_, i) => i !== index)
      .map((q, i) => ({
        ...q,
        question_number: i + 1, // Re-number questions
        order_index: i,
      }));
    onUpdateQuestions(newQuestions);
  }, [questions, onUpdateQuestions]);

  const moveQuestion = useCallback((fromIndex: number, toIndex: number) => {
    const newQuestions = [...questions];
    const [movedQuestion] = newQuestions.splice(fromIndex, 1);
    newQuestions.splice(toIndex, 0, movedQuestion);
    onUpdateQuestions(newQuestions.map((q, i) => ({ ...q, order_index: i, question_number: i + 1 })));
  }, [questions, onUpdateQuestions]);

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Part 1 Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Part 1 uses standard IELTS timing: <strong>30 seconds per question</strong>
            </p>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Questions ({questions.length})</h3>
          <Button onClick={addQuestion} variant="outline" size="sm">
            <Plus size={16} className="mr-1" />
            Add Question
          </Button>
        </div>

        {questions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
            <p>No questions yet for Part 1. Click "Add Question" to start.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {questions.map((question, index) => (
              <div
                key={question.id || index}
                className="border rounded-lg p-4 bg-muted/20 flex items-start gap-4"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('questionIndex', String(index));
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const draggedIndex = parseInt(e.dataTransfer.getData('questionIndex'));
                  if (draggedIndex !== index) {
                    moveQuestion(draggedIndex, index);
                  }
                }}
              >
                <div className="mt-2 cursor-grab text-muted-foreground">
                  <GripVertical size={20} />
                </div>
                <div className="flex-1 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">Question {question.question_number}</Label>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeQuestion(index)}
                    >
                      <Trash2 size={16} className="text-destructive" />
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Question Text</Label>
                    <RichTextEditor
                      value={question.question_text}
                      onChange={(value) => updateQuestion(index, { question_text: value })}
                      placeholder="Enter the question text..."
                      rows={2}
                    />
                  
                  </div>

                  {/* Audio Editor */}
                  <SpeakingQuestionAudioEditor
                    questionId={question.id || `temp-${index}`}
                    questionText={question.question_text}
                    audioUrl={question.audio_url}
                    onAudioUrlChange={(url) => updateQuestion(index, { audio_url: url })}
                    partNumber={1}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}