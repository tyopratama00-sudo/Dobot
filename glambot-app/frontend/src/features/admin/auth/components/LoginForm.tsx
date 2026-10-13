'use client';

import { Controller } from 'react-hook-form';
import { Field, FieldLabel, FieldError } from '@/components/admin/ui/field';
import { Input } from '@/components/admin/ui/input';
import { Button } from '@/components/admin/ui/button';
import { useLoginForm } from '../hooks/useLoginForm';
import { cn } from '@/lib/utils';

export const LoginForm = () => {
  const { form, onSubmit } = useLoginForm();

  return (
    <div
      className={cn(
        'font-grotesk w-full rounded-2xl border border-white/60 bg-white/95 shadow-2xl shadow-[#112D4E]/15 backdrop-blur-md',
        'p-7 md:p-9 lg:p-10 xl:p-20',
        'max-w-md md:max-w-lg lg:max-w-xl xl:max-w-160',
        'flex flex-col justify-center',
        'min-h-[75vh] md:min-h-[70vh] lg:min-h-[65vh] xl:min-h-auto',
      )}
    >
      {/* Header */}
      <div className="mb-6 text-center md:mb-8 lg:mb-9 xl:mb-16">
        <h1 className="text-3xl leading-tight font-normal text-[#112D4E] md:text-4xl lg:text-[42px] xl:text-[50px]">
          Welcome Back!
        </h1>
        <p className="mt-2 text-sm text-gray-500 md:text-base">
          Sign in to your Glambot admin account
        </p>
      </div>

      {/* Form */}
      <form
        className="space-y-4 md:space-y-5 lg:space-y-5 xl:space-y-10"
        onSubmit={onSubmit}
      >
        <fieldset
          disabled={form.formState.isSubmitting}
          className="space-y-4 md:space-y-5 lg:space-y-5 xl:space-y-10"
        >
          {/* Email Field */}
          <Controller
            control={form.control}
            name="email"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel
                  htmlFor={field.name}
                  className={
                    fieldState.invalid
                      ? 'text-sm font-medium text-red-500 md:text-sm lg:text-[13px] xl:text-[15px]'
                      : 'text-sm font-medium text-gray-700 md:text-sm lg:text-[13px] xl:text-[15px]'
                  }
                >
                  Email
                </FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  aria-invalid={fieldState.invalid}
                  placeholder="Enter your email"
                  className={
                    fieldState.invalid
                      ? 'h-12 w-full rounded-lg border border-red-500 px-4 py-3 text-sm placeholder:text-sm focus:border-red-500 focus:ring-2 focus:ring-red-500 focus:outline-none md:h-12 md:px-4 md:py-3 md:text-sm placeholder:md:text-sm lg:h-13 lg:px-5 lg:py-3 lg:text-[13px] placeholder:lg:text-[13px] xl:h-16 xl:px-6 xl:py-5 xl:text-[14px] placeholder:xl:text-[14px]'
                      : 'h-12 w-full rounded-lg border border-gray-200 px-4 py-3 text-sm placeholder:text-sm focus:border-none focus:border-[#112D4E] focus:ring-2 focus:ring-[#112D4E] focus:outline-none md:h-12 md:px-4 md:py-3 md:text-sm placeholder:md:text-sm lg:h-13 lg:px-5 lg:py-3 lg:text-[13px] placeholder:lg:text-[13px] xl:h-16 xl:px-6 xl:py-5 xl:text-[14px] placeholder:xl:text-[14px]'
                  }
                />
                {fieldState.invalid && (
                  <FieldError
                    errors={[fieldState.error]}
                    className="text-xs text-red-500 md:text-sm"
                  />
                )}
              </Field>
            )}
          />

          {/* Password Field */}
          <Controller
            control={form.control}
            name="password"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel
                  htmlFor={field.name}
                  className={
                    fieldState.invalid
                      ? 'text-sm font-medium text-red-500 md:text-sm lg:text-[13px] xl:text-[15px]'
                      : 'text-sm font-medium text-gray-700 md:text-sm lg:text-[13px] xl:text-[15px]'
                  }
                >
                  Password
                </FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  aria-invalid={fieldState.invalid}
                  type="password"
                  placeholder="Enter your password"
                  className={
                    fieldState.invalid
                      ? 'h-12 w-full rounded-lg border border-red-500 px-4 py-3 text-sm placeholder:text-sm focus:border-red-500 focus:ring-2 focus:ring-red-500 focus:outline-none md:h-12 md:px-4 md:py-3 md:text-sm placeholder:md:text-sm lg:h-13 lg:px-5 lg:py-3 lg:text-[13px] placeholder:lg:text-[13px] xl:h-16 xl:px-6 xl:py-5 xl:text-[14px] placeholder:xl:text-[14px]'
                      : 'h-12 w-full rounded-lg border border-gray-200 px-4 py-3 text-sm placeholder:text-sm focus:border-[#112D4E] focus:ring-2 focus:ring-[#112D4E] focus:outline-none md:h-12 md:px-4 md:py-3 md:text-sm placeholder:md:text-sm lg:h-13 lg:px-5 lg:py-3 lg:text-[13px] placeholder:lg:text-[13px] xl:h-16 xl:px-6 xl:py-5 xl:text-[14px] placeholder:xl:text-[14px]'
                  }
                />
                {fieldState.invalid && (
                  <FieldError
                    errors={[fieldState.error]}
                    className="text-xs text-red-500 md:text-sm"
                  />
                )}
              </Field>
            )}
          />

          {/* Forgot Password Link */}
          <div className="py-2 text-right lg:py-2 xl:py-2">
            <a
              href="#"
              className="text-xs text-gray-600 transition-colors hover:text-[#112D4E] md:text-sm lg:text-[13px] xl:text-[14px]"
            >
              Forgot Password?
            </a>
          </div>

          {/* Submit Button */}
          <div className="pt-3 md:pt-4 lg:pt-4 xl:pt-8">
            <Button
              className={cn(
                'w-full bg-[#112D4E] text-white hover:bg-[#0d2742]',
                'py-3 md:py-3 lg:py-3 xl:py-5',
                'rounded-lg font-medium transition-colors',
                'text-sm md:text-sm lg:text-[14px] xl:text-[15px]',
                'h-12 md:h-12 lg:h-13 xl:h-16',
              )}
              type="submit"
            >
              Sign In
            </Button>
          </div>
        </fieldset>
      </form>
    </div>
  );
};
