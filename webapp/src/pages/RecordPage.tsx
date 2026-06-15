import React, { useState, useCallback } from 'react';
import {
  Card,
  Steps,
  Button,
  Form,
  Input,
  Select,
  DatePicker,
  Switch,
  Upload,
  Space,
  Typography,
  Alert,
  Progress,
  message,
  Row,
  Col,
  Divider,
  Tabs,
  Tag,
} from 'antd';
import {
  UploadOutlined,
  AudioOutlined,
  PauseCircleOutlined,
  StopOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  SendOutlined,
  PlusOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { UploadFile } from 'antd/es/upload';
import dayjs from 'dayjs';
import { tasksApi } from '../api/tasks';
import { useChunkedUpload } from '../hooks/useChunkedUpload';
import { useMicRecorder } from '../hooks/useMicRecorder';
import type { MeetingMeta, MeetingType } from '../types';
import { MEETING_TYPE_LABELS } from '../types';

const { Title, Text } = Typography;
const { TextArea } = Input;

const SMALL_FILE_THRESHOLD = 10 * 1024 * 1024; // 10 MB

const formatDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const RecordPage: React.FC = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [inputTab, setInputTab] = useState<'upload' | 'record'>('upload');
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<MeetingMeta>();

  const { state: uploadState, startUpload } = useChunkedUpload();
  const { state: recorderState, start, pause, resume, stop, reset: resetRecorder } = useMicRecorder();

  const handleFileSelect = useCallback(
    (file: File) => {
      setSelectedFile(file);
      console.log('[DEBUG] RecordPage file selected:', file.name, file.size);
      return false; // prevent default upload
    },
    []
  );

  const handleRecordStop = useCallback(() => {
    stop();
  }, [stop]);

  const handleUseRecording = useCallback(() => {
    if (recorderState.audioBlob) {
      const file = new File(
        [recorderState.audioBlob],
        `recording_${dayjs().format('YYYYMMDDHHmmss')}.webm`,
        { type: recorderState.audioBlob.type }
      );
      setSelectedFile(file);
      setInputTab('upload');
    }
  }, [recorderState.audioBlob]);

  const canProceedStep1 =
    inputTab === 'upload' ? !!selectedFile : !!recorderState.audioBlob;

  const handleSubmit = async () => {
    try {
      await form.validateFields();
    } catch {
      return;
    }

    const values = form.getFieldsValue(true) as Partial<MeetingMeta> & {
      meeting_at?: dayjs.Dayjs;
      key_speakers_input?: string;
    };

    setSubmitting(true);

    try {
      let fileToUpload = selectedFile;

      // If recording was used, convert blob to File
      if (!fileToUpload && recorderState.audioBlob) {
        fileToUpload = new File(
          [recorderState.audioBlob],
          `recording_${dayjs().format('YYYYMMDDHHmmss')}.webm`,
          { type: recorderState.audioBlob.type }
        );
      }

      if (!fileToUpload) {
        message.error('请选择或录制音频文件');
        setSubmitting(false);
        return;
      }

      const meetingMeta: MeetingMeta = {
        source_type: 'audio',
        meeting_type: values.meeting_type ?? 'other',
        topic: values.topic ?? '',
        meeting_at: values.meeting_at
          ? (values.meeting_at as unknown as dayjs.Dayjs).toISOString()
          : dayjs().toISOString(),
        location: values.location ?? '',
        participants: values.participants ?? [],
        agenda: values.agenda ?? '',
        key_speakers: values.key_speakers ?? [],
        need_supervision_list: values.need_supervision_list ?? false,
        generate_word: values.generate_word ?? true,
        special_notes: values.special_notes ?? '',
        model_size: values.model_size ?? 'fun-asr',
        language: values.language ?? 'zh',
      };

      let taskId: number;

      if (fileToUpload.size <= SMALL_FILE_THRESHOLD) {
        // Small file: direct multipart POST
        const formData = new FormData();
        formData.append('file', fileToUpload);
        formData.append('meeting_meta', JSON.stringify(meetingMeta));

        console.log('[DEBUG] RecordPage direct upload, file size=', fileToUpload.size);
        const resp = await tasksApi.create(formData);
        taskId = resp.task.id;
      } else {
        // Large file: chunked upload then create task with upload_id
        console.log('[DEBUG] RecordPage chunked upload, file size=', fileToUpload.size);
        const uploadId = await startUpload(fileToUpload);

        if (!uploadId) {
          message.error('文件上传失败，请重试');
          setSubmitting(false);
          return;
        }

        const formData = new FormData();
        formData.append('upload_id', uploadId);
        formData.append('meeting_meta', JSON.stringify(meetingMeta));

        const resp = await tasksApi.create(formData);
        taskId = resp.task.id;
      }

      message.success('任务提交成功！');
      navigate(`/tasks/${taskId}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '提交失败，请重试';
      console.error('[DEBUG] RecordPage submit error:', msg);
      message.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const steps = [
    { title: '选择文件', description: '上传或录制音频' },
    { title: '填写信息', description: '会议基本信息' },
    { title: '提交转写', description: '确认并提交' },
  ];

  const renderStep1 = () => (
    <div>
      <Tabs
        activeKey={inputTab}
        onChange={(key) => setInputTab(key as 'upload' | 'record')}
        items={[
          {
            key: 'upload',
            label: (
              <span>
                <UploadOutlined /> 上传文件
              </span>
            ),
            children: (
              <div style={{ padding: '16px 0' }}>
                <Upload.Dragger
                  accept=".mp3,.wav,.m4a,.aac,.ogg,.flac,.webm,.mp4,.mov"
                  beforeUpload={handleFileSelect}
                  fileList={fileList}
                  onRemove={() => {
                    setSelectedFile(null);
                    setFileList([]);
                  }}
                  onChange={({ fileList: fl }) => setFileList(fl)}
                  maxCount={1}
                  style={{
                    background: '#252545',
                    border: '2px dashed #2e2e50',
                    borderRadius: 8,
                    padding: 24,
                  }}
                >
                  <p style={{ fontSize: 48, color: '#C41230' }}>
                    <UploadOutlined />
                  </p>
                  <p style={{ color: '#e8e8f0', fontSize: 16, marginBottom: 8 }}>
                    点击或拖拽文件到此区域
                  </p>
                  <p style={{ color: '#6b6b8f', fontSize: 13 }}>
                    支持 MP3、WAV、M4A、AAC、OGG、FLAC、WEBM、MP4、MOV
                  </p>
                  <p style={{ color: '#6b6b8f', fontSize: 12, marginTop: 8 }}>
                    小于10MB直接上传，大于10MB自动分片上传
                  </p>
                </Upload.Dragger>

                {selectedFile && (
                  <Alert
                    type="success"
                    icon={<CheckCircleOutlined />}
                    showIcon
                    message={
                      <span>
                        已选择：<strong>{selectedFile.name}</strong>
                        {'  '}
                        <Tag color="blue">
                          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                        </Tag>
                      </span>
                    }
                    style={{ marginTop: 16 }}
                  />
                )}

                {uploadState.uploading && (
                  <div style={{ marginTop: 16 }}>
                    <Text style={{ color: '#a0a0c0' }}>分片上传中...</Text>
                    <Progress percent={uploadState.progress} strokeColor="#C41230" />
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'record',
            label: (
              <span>
                <AudioOutlined /> 录音
              </span>
            ),
            children: (
              <div style={{ padding: '24px 0', textAlign: 'center' }}>
                {recorderState.error && (
                  <Alert type="error" message={recorderState.error} style={{ marginBottom: 16 }} />
                )}

                <div
                  style={{
                    width: 120,
                    height: 120,
                    borderRadius: '50%',
                    background:
                      recorderState.recordingState === 'recording'
                        ? 'radial-gradient(circle, rgba(196,18,48,0.3) 0%, rgba(196,18,48,0.1) 70%)'
                        : '#252545',
                    border: `3px solid ${
                      recorderState.recordingState === 'recording' ? '#C41230' : '#2e2e50'
                    }`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 24px',
                    transition: 'all 0.3s',
                    animation:
                      recorderState.recordingState === 'recording'
                        ? 'pulse 1.5s infinite'
                        : 'none',
                  }}
                >
                  <AudioOutlined
                    style={{
                      fontSize: 40,
                      color:
                        recorderState.recordingState === 'recording' ? '#C41230' : '#4a4a6a',
                    }}
                  />
                </div>

                <Title level={3} style={{ color: '#e8e8f0', marginBottom: 8 }}>
                  {formatDuration(recorderState.duration)}
                </Title>

                <Text style={{ color: '#6b6b8f', display: 'block', marginBottom: 24 }}>
                  {recorderState.recordingState === 'idle' && '点击开始录音'}
                  {recorderState.recordingState === 'recording' && '录音中...'}
                  {recorderState.recordingState === 'paused' && '已暂停'}
                  {recorderState.recordingState === 'stopped' && '录音完成'}
                </Text>

                <Space size={12}>
                  {recorderState.recordingState === 'idle' && (
                    <Button
                      type="primary"
                      icon={<AudioOutlined />}
                      size="large"
                      onClick={start}
                      style={{ background: '#C41230', borderColor: '#C41230' }}
                    >
                      开始录音
                    </Button>
                  )}

                  {recorderState.recordingState === 'recording' && (
                    <>
                      <Button
                        icon={<PauseCircleOutlined />}
                        size="large"
                        onClick={pause}
                        style={{ background: '#252545', borderColor: '#2e2e50', color: '#e8e8f0' }}
                      >
                        暂停
                      </Button>
                      <Button
                        danger
                        icon={<StopOutlined />}
                        size="large"
                        onClick={handleRecordStop}
                      >
                        停止
                      </Button>
                    </>
                  )}

                  {recorderState.recordingState === 'paused' && (
                    <>
                      <Button
                        type="primary"
                        icon={<AudioOutlined />}
                        size="large"
                        onClick={resume}
                        style={{ background: '#C41230', borderColor: '#C41230' }}
                      >
                        继续
                      </Button>
                      <Button
                        danger
                        icon={<StopOutlined />}
                        size="large"
                        onClick={handleRecordStop}
                      >
                        停止
                      </Button>
                    </>
                  )}

                  {recorderState.recordingState === 'stopped' && recorderState.audioUrl && (
                    <>
                      <audio controls src={recorderState.audioUrl} style={{ marginRight: 12 }} />
                      <Button
                        type="primary"
                        icon={<CheckCircleOutlined />}
                        size="large"
                        onClick={handleUseRecording}
                        style={{ background: '#52c41a', borderColor: '#52c41a' }}
                      >
                        使用此录音
                      </Button>
                      <Button
                        icon={<DeleteOutlined />}
                        size="large"
                        onClick={resetRecorder}
                        style={{ background: '#252545', borderColor: '#2e2e50', color: '#e8e8f0' }}
                      >
                        重新录制
                      </Button>
                    </>
                  )}
                </Space>
              </div>
            ),
          },
        ]}
      />
    </div>
  );

  const renderStep2 = () => (
    <Form
      form={form}
      layout="vertical"
      initialValues={{
        meeting_type: 'forum',
        language: 'zh',
        model_size: 'fun-asr',
        need_supervision_list: false,
        generate_word: true,
        participants: [{ name: '', role: '' }],
        key_speakers: [],
      }}
    >
      <Row gutter={[16, 0]}>
        <Col xs={24} sm={16}>
          <Form.Item
            name="topic"
            label="会议主题"
            rules={[{ required: true, message: '请输入会议主题' }]}
          >
            <Input placeholder="请输入会议主题" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={8}>
          <Form.Item
            name="meeting_type"
            label="会议类型"
            rules={[{ required: true, message: '请选择会议类型' }]}
          >
            <Select
              options={Object.entries(MEETING_TYPE_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={[16, 0]}>
        <Col xs={24} sm={12}>
          <Form.Item name="meeting_at" label="会议时间">
            <DatePicker
              showTime
              style={{ width: '100%' }}
              placeholder="选择会议时间"
              format="YYYY-MM-DD HH:mm"
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item name="location" label="会议地点">
            <Input placeholder="如：总行第一会议室" />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item name="agenda" label="会议议程">
        <TextArea rows={3} placeholder="请简述会议议程" />
      </Form.Item>

      <Divider style={{ borderColor: '#2e2e50', margin: '8px 0 16px' }}>
        <Text style={{ color: '#6b6b8f', fontSize: 12 }}>参会人员</Text>
      </Divider>

      <Form.List name="participants">
        {(fields, { add, remove }) => (
          <>
            {fields.map(({ key, name, ...restField }) => (
              <Row key={key} gutter={[8, 0]} align="middle" style={{ marginBottom: 8 }}>
                <Col flex={1}>
                  <Form.Item
                    {...restField}
                    name={[name, 'name']}
                    style={{ marginBottom: 0 }}
                  >
                    <Input placeholder="姓名" />
                  </Form.Item>
                </Col>
                <Col flex={1}>
                  <Form.Item
                    {...restField}
                    name={[name, 'role']}
                    style={{ marginBottom: 0 }}
                  >
                    <Input placeholder="职务/角色" />
                  </Form.Item>
                </Col>
                <Col>
                  <MinusCircleOutlined
                    style={{ color: '#ff4d4f', cursor: 'pointer', fontSize: 16 }}
                    onClick={() => remove(name)}
                  />
                </Col>
              </Row>
            ))}
            <Button
              type="dashed"
              onClick={() => add()}
              icon={<PlusOutlined />}
              style={{
                width: '100%',
                background: '#252545',
                borderColor: '#2e2e50',
                color: '#a0a0c0',
                marginBottom: 16,
              }}
            >
              添加参会人员
            </Button>
          </>
        )}
      </Form.List>

      <Form.Item name="key_speakers" label="主要发言人">
        <Select
          mode="tags"
          placeholder="输入发言人姓名后按回车"
          style={{ width: '100%' }}
        />
      </Form.Item>

      <Divider style={{ borderColor: '#2e2e50', margin: '8px 0 16px' }}>
        <Text style={{ color: '#6b6b8f', fontSize: 12 }}>转写设置</Text>
      </Divider>

      <Row gutter={[16, 0]}>
        <Col xs={24} sm={8}>
          <Form.Item name="model_size" label="识别模型">
            <Select
              options={[
                { value: 'fun-asr', label: 'FunASR（推荐）' },
                { value: 'whisper-small', label: 'Whisper Small' },
                { value: 'whisper-large-v3', label: 'Whisper Large v3' },
              ]}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={8}>
          <Form.Item name="language" label="语言">
            <Select
              options={[
                { value: 'zh', label: '中文' },
                { value: 'en', label: '英文' },
                { value: 'auto', label: '自动检测' },
              ]}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={8}>
          <Form.Item name="special_notes" label="特殊说明">
            <Input placeholder="如：包含少量方言" />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={[32, 0]}>
        <Col>
          <Form.Item name="need_supervision_list" label="生成督办清单" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Col>
        <Col>
          <Form.Item name="generate_word" label="生成Word文档" valuePropName="checked">
            <Switch defaultChecked />
          </Form.Item>
        </Col>
      </Row>
    </Form>
  );

  const renderStep3 = () => {
    const values = form.getFieldsValue(true);
    const meetingAt = values.meeting_at
      ? dayjs.isDayjs(values.meeting_at)
        ? values.meeting_at.format('YYYY-MM-DD HH:mm')
        : dayjs(values.meeting_at).format('YYYY-MM-DD HH:mm')
      : '未设置';

    return (
      <div>
        <Alert
          type="info"
          showIcon
          message="请确认以下信息后提交"
          style={{ marginBottom: 16 }}
        />

        <Card
          style={{ background: '#252545', border: '1px solid #2e2e50', borderRadius: 8 }}
          styles={{ body: { padding: 20 } }}
        >
          <Row gutter={[16, 12]}>
            <Col xs={24} sm={12}>
              <Text style={{ color: '#6b6b8f' }}>文件名称：</Text>
              <Text style={{ color: '#e8e8f0' }}>
                {selectedFile?.name ?? recorderState.audioBlob ? '录音文件' : '未选择'}
              </Text>
            </Col>
            <Col xs={24} sm={12}>
              <Text style={{ color: '#6b6b8f' }}>文件大小：</Text>
              <Text style={{ color: '#e8e8f0' }}>
                {selectedFile
                  ? `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB`
                  : recorderState.audioBlob
                  ? `${(recorderState.audioBlob.size / 1024 / 1024).toFixed(2)} MB`
                  : '—'}
              </Text>
            </Col>
            <Col xs={24} sm={12}>
              <Text style={{ color: '#6b6b8f' }}>会议主题：</Text>
              <Text style={{ color: '#e8e8f0' }}>{values.topic || '—'}</Text>
            </Col>
            <Col xs={24} sm={12}>
              <Text style={{ color: '#6b6b8f' }}>会议类型：</Text>
              <Text style={{ color: '#e8e8f0' }}>
                {MEETING_TYPE_LABELS[values.meeting_type as MeetingType] ?? '—'}
              </Text>
            </Col>
            <Col xs={24} sm={12}>
              <Text style={{ color: '#6b6b8f' }}>会议时间：</Text>
              <Text style={{ color: '#e8e8f0' }}>{meetingAt}</Text>
            </Col>
            <Col xs={24} sm={12}>
              <Text style={{ color: '#6b6b8f' }}>会议地点：</Text>
              <Text style={{ color: '#e8e8f0' }}>{values.location || '—'}</Text>
            </Col>
            <Col xs={24} sm={12}>
              <Text style={{ color: '#6b6b8f' }}>识别模型：</Text>
              <Text style={{ color: '#e8e8f0' }}>{values.model_size ?? 'fun-asr'}</Text>
            </Col>
            <Col xs={24} sm={12}>
              <Text style={{ color: '#6b6b8f' }}>语言：</Text>
              <Text style={{ color: '#e8e8f0' }}>
                {values.language === 'zh' ? '中文' : values.language === 'en' ? '英文' : '自动'}
              </Text>
            </Col>
            <Col xs={24} sm={12}>
              <Text style={{ color: '#6b6b8f' }}>督办清单：</Text>
              <Text style={{ color: '#e8e8f0' }}>
                {values.need_supervision_list ? '是' : '否'}
              </Text>
            </Col>
            <Col xs={24} sm={12}>
              <Text style={{ color: '#6b6b8f' }}>生成Word：</Text>
              <Text style={{ color: '#e8e8f0' }}>{values.generate_word ? '是' : '否'}</Text>
            </Col>
          </Row>
        </Card>

        {uploadState.uploading && (
          <div style={{ marginTop: 16 }}>
            <Text style={{ color: '#a0a0c0' }}>上传进度：</Text>
            <Progress percent={uploadState.progress} strokeColor="#C41230" />
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '0' }}>
      <div style={{ marginBottom: 24 }}>
        <Title level={4} style={{ color: '#e8e8f0', margin: 0 }}>
          新建转写任务
        </Title>
        <Text style={{ color: '#6b6b8f' }}>上传或录制音频，填写会议信息后提交转写</Text>
      </div>

      <Card
        style={{ background: '#1e1e36', border: '1px solid #2e2e50', borderRadius: 8 }}
        styles={{ body: { padding: '24px 16px 20px' } }}
      >
        <Steps
          current={currentStep}
          items={steps}
          style={{ marginBottom: 32 }}
        />

        <div style={{ minHeight: 320 }}>
          {currentStep === 0 && renderStep1()}
          {currentStep === 1 && renderStep2()}
          {currentStep === 2 && renderStep3()}
        </div>

        <Divider style={{ borderColor: '#2e2e50' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button
            icon={<ArrowLeftOutlined />}
            disabled={currentStep === 0}
            onClick={() => setCurrentStep((s) => s - 1)}
            style={{ background: '#252545', borderColor: '#2e2e50', color: '#e8e8f0' }}
          >
            上一步
          </Button>

          <Space>
            <Button onClick={() => navigate('/')} style={{ background: '#252545', borderColor: '#2e2e50', color: '#e8e8f0' }}>
              取消
            </Button>

            {currentStep < 2 ? (
              <Button
                type="primary"
                icon={<ArrowRightOutlined />}
                disabled={currentStep === 0 && !canProceedStep1}
                onClick={async () => {
                  if (currentStep === 1) {
                    try {
                      await form.validateFields();
                    } catch {
                      return;
                    }
                  }
                  setCurrentStep((s) => s + 1);
                }}
                style={{ background: '#C41230', borderColor: '#C41230' }}
              >
                下一步
              </Button>
            ) : (
              <Button
                type="primary"
                icon={<SendOutlined />}
                loading={submitting || uploadState.uploading}
                onClick={handleSubmit}
                style={{ background: '#C41230', borderColor: '#C41230' }}
              >
                {submitting ? '提交中...' : '提交转写'}
              </Button>
            )}
          </Space>
        </div>
      </Card>
    </div>
  );
};

export default RecordPage;
