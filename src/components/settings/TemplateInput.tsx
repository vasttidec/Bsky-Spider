import React from 'react';
import { App, Button, Input, Tooltip } from 'antd';
import { CopyOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { TEMPLATE_VARIABLES } from '../../../shared/templates';
import { useI18n } from '../../i18n';

export const TemplateInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
}> = ({ value, onChange, placeholder, ariaLabel }) => {
  const { message } = App.useApp();
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);

  const copyVariable = async (variable: string) => {
    const text = `%${variable}%`;
    try {
      await navigator.clipboard.writeText(text);
      message.success(t('已复制 {{value}}', { value: text }));
    } catch {
      message.warning(t('请手动输入 {{value}}', { value: text }));
    }
  };

  return (
    <div>
      <Input
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className="!rounded-xl !font-mono !text-xs"
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px] text-slate-400">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="inline-flex items-center gap-1 text-brand-500 transition hover:text-brand-700"
        >
          <InfoCircleOutlined />
          {open ? t('收起变量列表') : t('查看并复制可用变量')}
        </button>
        <span>
          {t('参数写法：')}
          <code>%POST_TIME,d=1%</code> · <code>%TEXT,t=16%</code>
        </span>
      </div>

      {open && (
        <div className="template-vars">
          {TEMPLATE_VARIABLES.map((variable) => (
            <Tooltip key={variable.key} title={t(variable.description)}>
              <Button
                size="small"
                onClick={() => void copyVariable(variable.key)}
                className="!rounded-lg !border-slate-200 !bg-white !text-[10px] !text-slate-500 hover:!border-brand-300 hover:!text-brand-600"
              >
                <CopyOutlined className="mr-1 text-[9px]" />
                %{variable.key}%
              </Button>
            </Tooltip>
          ))}
          <p className="w-full pt-1 text-[10px] leading-relaxed text-slate-400">
            {t('变量会被自动清理为合法文件名。点击变量可复制，然后粘贴到上方输入框。')}
          </p>
        </div>
      )}
    </div>
  );
};
