import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Upload, Trash2, Volume2, Wand2, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { uploadToR2 } from '@/lib/r2Upload';
import { compressAudio } from '@/utils/audioCompressor';

interface SpeakingQuestionAudioEditorProps {
  questionId: string;
  questionText: string;
  audioUrl?: string | null;
  onAudioUrlChange: (url: string | null) => void;
  partNumber: number;
}

export function SpeakingQuestionAudioEditor({
  questionId,
  questionText,
  audioUrl,
  onAudioUrlChange,
  partNumber,
}: SpeakingQuestionAudioEditorProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [generationProgress, setGenerationProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('audio/')) {
      toast.error('Please select an audio file');
      return;
    }

    // Max 50MB
    if (file.size > 50 * 1024 * 1024) {
      toast.error('File size must be less than 50MB');
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);

    try {
      // Compress audio to MP3
      setUploadProgress(20);
      let fileToUpload: File = file;
      
      try {
        const compressedFile = await compressAudio(file);
        fileToUpload = compressedFile;
        setUploadProgress(50);
        toast.info(`Compressed to ${(compressedFile.size / 1024).toFixed(0)}KB`);
      } catch (compressError) {
        console.warn('Compression failed, uploading original:', compressError);
        setUploadProgress(50);
      }

      // Upload to R2
      const result = await uploadToR2({
        file: fileToUpload,
        folder: `speaking-questions/part${partNumber}`,
        fileName: `${questionId}.mp3`,
        onProgress: (p) => setUploadProgress(50 + p * 0.5),
      });

      if (result.success && result.url) {
        // Add cache-busting timestamp to force browser to reload audio metadata
        const urlWithCacheBust = `${result.url}?t=${Date.now()}`;
        onAudioUrlChange(urlWithCacheBust);
        toast.success('Audio uploaded successfully');
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(`Upload failed: ${error.message}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleGenerateAudio = async () => {
    if (!questionText.trim()) {
      toast.error('Question text is required to generate audio');
      return;
    }

    setIsGenerating(true);
    setGenerationProgress(10);

    try {
      // Call generate-gemini-tts edge function
      setGenerationProgress(30);
      
      const { data, error } = await supabase.functions.invoke('generate-gemini-tts', {
        body: {
          items: [{ key: questionId, text: questionText }],
          directory: `speaking-questions/part${partNumber}`,
          voiceName: 'Charon', // Unified male examiner voice for all speaking tests
          adminMode: true, // Use admin API key pool for Cambridge speaking audio
        },
      });

      setGenerationProgress(80);

      if (error) {
        throw error;
      }

      if (!data?.success || !data?.clips?.length) {
        throw new Error(data?.error || 'No audio generated');
      }

      const clip = data.clips[0];
      
      if (clip.url) {
        // Add cache-busting timestamp to force browser to reload audio metadata
        const urlWithCacheBust = `${clip.url}?t=${Date.now()}`;
        onAudioUrlChange(urlWithCacheBust);
        toast.success('Audio generated and uploaded successfully');
      } else if (clip.audioBase64) {
        // Fallback: if R2 upload failed, we got base64 back
        toast.warning('Audio generated but upload failed. Please try uploading manually.');
      } else {
        throw new Error('No audio URL returned');
      }

      setGenerationProgress(100);
    } catch (error: any) {
      console.error('Generation error:', error);
      toast.error(`Generation failed: ${error.message}`);
    } finally {
      setIsGenerating(false);
      setGenerationProgress(0);
    }
  };

  const handleRemoveAudio = () => {
    onAudioUrlChange(null);
    toast.info('Audio removed');
  };

  return (
    <div className="space-y-3 p-3 bg-muted/30 rounded-lg border">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium flex items-center gap-1">
          <Volume2 size={14} />
          Examiner Audio
        </Label>
        {audioUrl && (
          <Badge variant="outline" className="text-xs bg-success/10 text-success">
            <Check size={12} className="mr-1" />
            Audio Set
          </Badge>
        )}
      </div>

      {audioUrl ? (
        <div className="space-y-2">
          <audio controls src={audioUrl} className="w-full h-8" preload="metadata" />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isGenerating}
            >
              <Upload size={14} className="mr-1" />
              Replace
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleGenerateAudio}
              disabled={isUploading || isGenerating}
            >
              {isGenerating ? (
                <Loader2 size={14} className="mr-1 animate-spin" />
              ) : (
                <Wand2 size={14} className="mr-1" />
              )}
              Regenerate
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemoveAudio}
              disabled={isUploading || isGenerating}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 size={14} />
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isGenerating}
              className="flex-1"
            >
              {isUploading ? (
                <Loader2 size={14} className="mr-1 animate-spin" />
              ) : (
                <Upload size={14} className="mr-1" />
              )}
              Upload Audio
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleGenerateAudio}
              disabled={isUploading || isGenerating || !questionText.trim()}
              className="flex-1"
            >
              {isGenerating ? (
                <Loader2 size={14} className="mr-1 animate-spin" />
              ) : (
                <Wand2 size={14} className="mr-1" />
              )}
              Generate AI Audio
            </Button>
          </div>

          {(isUploading || isGenerating) && (
            <Progress value={isUploading ? uploadProgress : generationProgress} className="h-1" />
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}
